import { config } from '@grafana/runtime';
import { ResourceDimensionMode } from '@grafana/schema';
import { type DimensionContext } from 'app/features/dimensions/context';
import { BackgroundImageSize } from 'app/plugins/panel/canvas/panelcfg.gen';

import { type CanvasFrameOptions } from '../frame';

import { RootElement } from './root';
import { type Scene } from './scene';

class MockImage {
  naturalWidth = 0;
  naturalHeight = 0;
  onload: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  src = '';
}

describe('RootElement background sizing', () => {
  const previousFlagValue = config.featureToggles.canvasPanelPanZoom;
  const originalImage = global.Image;
  let images: MockImage[];

  beforeAll(() => {
    config.featureToggles.canvasPanelPanZoom = true;
  });

  beforeEach(() => {
    images = [];
    global.Image = jest.fn(() => {
      const image = new MockImage();
      images.push(image);
      return image;
    }) as unknown as typeof Image;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    config.featureToggles.canvasPanelPanZoom = previousFlagValue;
    global.Image = originalImage;
  });

  it('expands an Original background to its intrinsic dimensions', () => {
    const { root, scene, context } = createRoot('map.png');

    root.updateData(context);
    images[0].naturalWidth = 2646;
    images[0].naturalHeight = 1614;
    images[0].onload?.(new Event('load'));

    expect(root.sizeStyle).toEqual({ width: '2646px', height: '1614px' });
    expect(root.getLogicalSize()).toEqual({ width: 2646, height: 1614 });
    expect(scene.onRootSizeChanged).toHaveBeenCalledTimes(1);
  });

  it('does not shrink the root below the panel dimensions', () => {
    const { root, context } = createRoot('small.png');

    root.updateData(context);
    images[0].naturalWidth = 320;
    images[0].naturalHeight = 200;
    images[0].onload?.(new Event('load'));

    expect(root.sizeStyle).toEqual({ width: '600px', height: '400px' });
  });

  it('recalculates dimensions when the panel is resized', () => {
    const { root, scene, context } = createRoot('map.png');
    root.updateData(context);
    images[0].naturalWidth = 1200;
    images[0].naturalHeight = 800;
    images[0].onload?.(new Event('load'));

    scene.width = 1600;
    scene.height = 500;
    root.updateSize();

    expect(root.sizeStyle).toEqual({ width: '1600px', height: '800px' });
  });

  it('uses usable intrinsic dimensions reported for an SVG', () => {
    const { root, context } = createRoot('diagram.svg');
    root.updateData(context);
    images[0].naturalWidth = 1920;
    images[0].naturalHeight = 1080;
    images[0].onload?.(new Event('load'));

    expect(root.sizeStyle).toEqual({ width: '1920px', height: '1080px' });
  });

  it('ignores a stale image load after the URL changes', () => {
    const { root, context } = createRoot('first.png');
    root.updateData(context);
    const firstImage = images[0];
    const staleOnLoad = firstImage.onload;

    root.options.background!.image!.fixed = 'second.png';
    root.updateData(context);
    staleOnLoad?.(new Event('load'));

    images[1].naturalWidth = 1200;
    images[1].naturalHeight = 800;
    images[1].onload?.(new Event('load'));

    expect(root.sizeStyle).toEqual({ width: '1200px', height: '800px' });
  });

  it.each([
    ['pan and zoom is disabled', false, BackgroundImageSize.Original],
    ['the background uses contain', true, BackgroundImageSize.Contain],
    ['the background uses cover', true, BackgroundImageSize.Cover],
    ['the background uses fill', true, BackgroundImageSize.Fill],
    ['the background uses tile', true, BackgroundImageSize.Tile],
  ])('keeps viewport sizing when %s', (_name, panZoom, size) => {
    const { root, context } = createRoot('map.png', panZoom, size);

    root.updateData(context);

    expect(images).toHaveLength(0);
    expect(root.sizeStyle).toEqual({ width: '100%', height: '100%' });
  });

  it('restores viewport sizing when the image is removed', () => {
    const { root, scene, context } = createRoot('map.png');
    root.updateData(context);
    images[0].naturalWidth = 1200;
    images[0].naturalHeight = 800;
    images[0].onload?.(new Event('load'));

    root.options.background = undefined;
    root.updateData(context);

    expect(root.sizeStyle).toEqual({ width: '100%', height: '100%' });
    expect(root.getLogicalSize()).toEqual({ width: 600, height: 400 });
    expect(scene.onRootSizeChanged).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['fails to load', 0, 0, 'error'],
    ['has no usable intrinsic dimensions', 0, 0, 'load'],
  ])('keeps viewport sizing when the image %s', (_description, width, height, event) => {
    const { root, context } = createRoot('invalid.svg');
    root.updateData(context);
    images[0].naturalWidth = width;
    images[0].naturalHeight = height;

    if (event === 'load') {
      images[0].onload?.(new Event('load'));
    } else {
      images[0].onerror?.(new Event('error'));
    }

    expect(root.sizeStyle).toEqual({ width: '100%', height: '100%' });
    expect(root.hasIntrinsicBackgroundDimensions()).toBe(false);
  });

  it('retries a failed image on the next data update', () => {
    const { root, context } = createRoot('temporary-error.png');
    root.updateData(context);
    images[0].onerror?.(new Event('error'));

    root.updateData(context);

    expect(images).toHaveLength(2);
  });

  it('ignores an in-flight image after disposal', () => {
    const { root, scene, context } = createRoot('map.png');
    root.updateData(context);
    const onLoad = images[0].onload;

    root.dispose();
    onLoad?.(new Event('load'));

    expect(scene.onRootSizeChanged).not.toHaveBeenCalled();
  });
});

function createRoot(imageUrl: string, panZoom = true, size: BackgroundImageSize = BackgroundImageSize.Original) {
  const scene = {
    width: 600,
    height: 400,
    shouldPanZoom: panZoom,
    onRootSizeChanged: jest.fn(),
  } as unknown as Scene;
  const options: CanvasFrameOptions = {
    name: 'Canvas root',
    type: 'frame',
    elements: [],
    background: {
      image: { mode: ResourceDimensionMode.Fixed, fixed: imageUrl },
      size,
    },
  };
  const context = {
    getResource: () => ({ fixed: options.background?.image?.fixed, value: () => options.background?.image?.fixed }),
    getPanelData: () => undefined,
  } as unknown as DimensionContext;

  return { root: new RootElement(options, scene, jest.fn()), scene, context };
}
