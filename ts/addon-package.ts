import { Memoize } from 'typescript-memoize';
import { join, dirname } from 'path';
import { Tree } from 'broccoli-plugin';
import Funnel from 'broccoli-funnel';
import mergeTrees from 'broccoli-merge-trees';
import V1InstanceCache from './v1-instance-cache';
import Package from './package';
import resolve from 'resolve';
import PackageCache from './package-cache';
import V1Addon from './v1-addon';
import { todo } from './messages';

export default class AddonPackage implements Package {
  oldAddon: V1Addon;

  constructor(public root: string, private packageCache: PackageCache, private v1Cache: V1InstanceCache) {}

  addParent(pkg: Package){
    let v1Addon = this.v1Cache.getAddon(this.root, pkg.root);
    if (v1Addon) {
      if (!this.oldAddon) {
        this.oldAddon = v1Addon;
      } else if (v1Addon.hasAnyTrees()){
        todo(`duplicate build of ${v1Addon.name}`);
      }
    }
  }

  get tree(): Tree {
    let trees = this.oldAddon.v2Trees();
    return new Funnel(mergeTrees(trees), {
      destDir: this.oldAddon.name
    });
  }

  @Memoize()
  private get packageJSON() {
    return require(join(this.root, 'package.json'));
  }

  get isEmberPackage() : boolean {
    let keywords = this.packageJSON.keywords;
    return keywords && keywords.indexOf('ember-addon') !== -1;
  }

  get dependencies(): AddonPackage[] {
    let names = Object.keys(this.packageJSON.dependencies || {});
    return names.map(name => {
      let addonRoot = dirname(resolve.sync(join(name, 'package.json'), { basedir: this.root }));
      return this.packageCache.getPackage(addonRoot, this);
    }).filter(Boolean);
  }
}