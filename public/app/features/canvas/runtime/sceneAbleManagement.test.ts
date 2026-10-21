import { calculateGroupBoundingBox, calculateZoomToFitScale } from './sceneAbleManagement';

describe('Canvas zoom-to-content bounds', () => {
  const originalDOMMatrix = global.DOMMatrix;

  beforeAll(() => {
    global.DOMMatrix = jest.fn((transform: string) => {
      const values = transform
        .match(/matrix\((.+)\)/)?.[1]
        .split(',')
        .map(Number);
      return { m41: values?.[4] ?? 0, m42: values?.[5] ?? 0 };
    }) as unknown as typeof DOMMatrix;
  });

  afterAll(() => {
    global.DOMMatrix = originalDOMMatrix;
  });

  afterEach(() => {
    document.body.replaceChildren();
    jest.restoreAllMocks();
  });

  it('combines root background and child bounds', () => {
    const root = createElement(600, 400, 0, 0);
    const child = createElement(100, 100, 700, 100);

    expect(calculateGroupBoundingBox([root, child])).toEqual({
      left: 0,
      top: 0,
      right: 800,
      bottom: 400,
      width: 800,
      height: 400,
      centerX: 400,
      centerY: 200,
    });
  });

  it('fits combined bounds within the viewer', () => {
    const root = createElement(600, 400, 0, 0);
    const child = createElement(100, 100, 700, 100);
    const viewer = document.createElement('div');
    jest.spyOn(viewer, 'getBoundingClientRect').mockReturnValue({
      width: 1000,
      height: 500,
    } as DOMRect);

    expect(calculateZoomToFitScale([root, child], viewer, 0)).toEqual({
      scale: 1.25,
      centerX: 0,
      centerY: 0,
    });
  });

  it('returns a stable default for empty content', () => {
    const viewer = document.createElement('div');
    jest.spyOn(viewer, 'getBoundingClientRect').mockReturnValue({ width: 600, height: 400 } as DOMRect);

    expect(calculateGroupBoundingBox([])).toEqual({
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      centerX: 0,
      centerY: 0,
    });
    expect(calculateZoomToFitScale([], viewer)).toEqual({ scale: 1, centerX: 0, centerY: 0 });
  });

  it('uses the viewer zoom limit when content requires a smaller scale', () => {
    const root = createElement(5000, 5000, 0, 0);
    const viewer = document.createElement('div');
    jest.spyOn(viewer, 'getBoundingClientRect').mockReturnValue({ width: 100, height: 100 } as DOMRect);

    expect(calculateZoomToFitScale([root], viewer, 0)).toEqual({
      scale: 0.1,
      centerX: 2000,
      centerY: 2000,
    });
  });
});

function createElement(width: number, height: number, x: number, y: number) {
  const element = document.createElement('div');
  element.style.width = `${width}px`;
  element.style.height = `${height}px`;
  element.style.transform = `matrix(1, 0, 0, 1, ${x}, ${y})`;
  document.body.appendChild(element);
  return element;
}
