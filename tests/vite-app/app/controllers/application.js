import Controller from '@ember/controller';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';

export default class ApplicationController extends Controller {
  // Add TagInput to test vendor.css
  @tracked tags = ['Embroider'];
  @action addTag() {}
  @action removeTagAtIndex() {}

  @action
  toggleBody() {
    this.toggleProperty('isExpanded');
  }
}