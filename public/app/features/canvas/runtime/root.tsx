import { Fragment } from 'react';

import { config } from '@grafana/runtime';
import { type DimensionContext } from 'app/features/dimensions/context';
import { BackgroundImageSize } from 'app/plugins/panel/canvas/panelcfg.gen';

import { type CanvasFrameOptions } from '../frame';

import { FrameState } from './frame';
import { type Scene } from './scene';

export class RootElement extends FrameState {
  private backgroundImage?: HTMLImageElement;
  private backgroundImageUrl?: string;
  private backgroundImageDimensions?: { width: number; height: number };

  constructor(
    public options: CanvasFrameOptions,
    public scene: Scene,
    private changeCallback: () => void
  ) {
    super(options, scene);

    this.sizeStyle = {
      height: '100%',
      width: '100%',
    };
  }

  isRoot(): this is RootElement {
    return true;
  }

  updateData(ctx: DimensionContext) {
    super.updateData(ctx);

    const background = this.options.background;
    const imageUrl = background?.image ? ctx.getResource(background.image)?.value() : undefined;
    if (
      !config.featureToggles.canvasPanelPanZoom ||
      !this.scene.shouldPanZoom ||
      background?.size !== BackgroundImageSize.Original ||
      !imageUrl
    ) {
      this.clearBackgroundImage();
      return;
    }

    if (imageUrl === this.backgroundImageUrl) {
      return;
    }

    this.clearBackgroundImage();
    this.backgroundImageUrl = imageUrl;

    const image = new Image();
    this.backgroundImage = image;
    image.onload = () => {
      if (this.backgroundImage !== image) {
        return;
      }

      const width = image.naturalWidth;
      const height = image.naturalHeight;
      if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
        this.backgroundImageDimensions = { width, height };
      }
      this.updateSize();
      this.scene.onRootSizeChanged();
    };
    image.onerror = () => {
      if (this.backgroundImage !== image) {
        return;
      }

      this.backgroundImage = undefined;
      this.backgroundImageUrl = undefined;
      this.backgroundImageDimensions = undefined;
      this.updateSize();
      this.scene.onRootSizeChanged();
    };
    image.src = imageUrl;
  }

  updateSize() {
    const { width, height } = this.getLogicalSize();
    const usesIntrinsicSize = this.hasIntrinsicBackgroundDimensions();
    const widthStyle = usesIntrinsicSize ? `${width}px` : '100%';
    const heightStyle = usesIntrinsicSize ? `${height}px` : '100%';
    this.sizeStyle = { width: widthStyle, height: heightStyle };

    if (this.div) {
      this.div.style.width = widthStyle;
      this.div.style.height = heightStyle;
    }
  }

  getLogicalSize() {
    const dimensions = this.getActiveBackgroundDimensions();
    if (!dimensions) {
      return { width: this.scene.width, height: this.scene.height };
    }

    return {
      width: Math.max(this.scene.width, dimensions.width),
      height: Math.max(this.scene.height, dimensions.height),
    };
  }

  hasIntrinsicBackgroundDimensions() {
    return Boolean(this.getActiveBackgroundDimensions());
  }

  private getActiveBackgroundDimensions() {
    if (
      config.featureToggles.canvasPanelPanZoom &&
      this.scene.shouldPanZoom &&
      this.options.background?.size === BackgroundImageSize.Original
    ) {
      return this.backgroundImageDimensions;
    }

    return undefined;
  }

  dispose() {
    this.clearBackgroundImage(false);
  }

  private clearBackgroundImage(updateScene = true) {
    const hadDimensions = Boolean(this.backgroundImageDimensions);
    if (this.backgroundImage) {
      this.backgroundImage.onload = null;
      this.backgroundImage.onerror = null;
    }
    this.backgroundImage = undefined;
    this.backgroundImageUrl = undefined;
    this.backgroundImageDimensions = undefined;

    if (hadDimensions && updateScene) {
      this.updateSize();
      this.scene.onRootSizeChanged();
    }
  }

  // root type can not change
  onChange(options: CanvasFrameOptions) {
    this.revId++;
    this.options = { ...options };
    this.changeCallback();
  }

  getSaveModel(): CanvasFrameOptions {
    const { placement, constraint, ...rest } = this.options;

    return {
      ...rest, // everything except placement & constraint
      elements: this.elements.map((v) => v.getSaveModel()),
    };
  }

  setRootRef = (target: HTMLDivElement) => {
    this.div = target;
    this.updateSize();
  };

  renderElement() {
    return (
      <div
        onContextMenu={(event) => event.preventDefault()}
        key={this.UID}
        ref={this.setRootRef}
        style={{ ...this.sizeStyle, ...this.dataStyle }}
      >
        {this.elements.map((v) => (
          <Fragment key={v.UID}>{v.renderElement()}</Fragment>
        ))}
      </div>
    );
  }
}
