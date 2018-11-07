import Plugin from "broccoli-plugin";
import { join } from 'path';
import {
  emptyDirSync,
  readdirSync,
  ensureSymlinkSync,
  removeSync,
  ensureDirSync,
  realpathSync,
  mkdtempSync,
  copySync,
} from 'fs-extra';
import Workspace from './workspace';
import V1InstanceCache from "./v1-instance-cache";
import PackageCache from "./package-cache";
import { V1AddonConstructor } from "./v1-addon";
import { tmpdir } from 'os';
import MovedPackageCache from "./moved-package-cache";
import MovedPackage from "./moved-package";
import Package from "./package";
import MovedApp from "./moved-app";

interface Options {
  workspaceDir?: string;
  compatAdapters?: Map<string, V1AddonConstructor>;
}

export default class CompatWorkspace extends Plugin implements Workspace {
  private didBuild: boolean;
  private destDir: string;
  private moved: MovedPackageCache;
  readonly appSource: Package;

  constructor(legacyEmberAppInstance: any, options?: Options) {
    let destDir;
    if (options && options.workspaceDir) {
      ensureDirSync(options.workspaceDir);
      destDir = realpathSync(options.workspaceDir);
    } else {
      destDir = mkdtempSync(join(tmpdir(), 'embroider-'));
    }

    let v1Cache = V1InstanceCache.findOrCreate(legacyEmberAppInstance);

    if (options.compatAdapters) {
      for (let [packageName, adapter] of options.compatAdapters) {
        v1Cache.registerCompatAdapter(packageName, adapter);
      }
    }

    // this holds our underlying, real on-disk packages
    let packageCache = new PackageCache();

    // the topmost package, representing our app
    let app = packageCache.getPackage(v1Cache.app.root);

    // this layers on top of packageCache and overrides the packages that need
    // to move into our workspace.
    let moved = MovedPackageCache.create(packageCache, app, destDir, v1Cache);

    super(moved.all.map(entry => entry[1].asTree()), {
      annotation: 'embroider:core:workspace',
      persistentOutput: true,
      needsCache: false
    });

    this.didBuild = false;
    this.moved = moved;
    this.appSource = app;
    this.destDir = destDir;
  }

  clearApp() {
    for (let name of readdirSync(this.appDest.root)) {
      if (name !== 'node_modules') {
        removeSync(join(this.appDest.root, name));
      }
    }
  }

  copyIntoApp(srcDir: string) {
    copySync(srcDir, this.appDest.root, { dereference: true });
  }

  get appDest(): MovedApp {
    return this.moved.app;
  }

  async build() {
    if (this.didBuild) {
      // TODO: we can selectively allow some addons to rebuild, equivalent to
      // the old isDevelopingAddon.
      return;
    }

    emptyDirSync(this.destDir);

    this.moved.all.forEach(([, movedPkg], index) => {
      copySync(this.inputPaths[index], movedPkg.root, { dereference: true });
      this.linkNonCopiedDeps(movedPkg);
    });
    this.linkNonCopiedDeps(this.moved.app);
    await this.moved.updatePreexistingResolvableSymlinks();
    this.didBuild = true;
  }

  private linkNonCopiedDeps(pkg: MovedPackage | MovedApp) {
    for (let dep of pkg.dependencies) {
      if (!(dep instanceof MovedPackage)) {
        ensureSymlinkSync(dep.root, join(pkg.root, 'node_modules', dep.packageJSON.name));
      }
    }
  }
}