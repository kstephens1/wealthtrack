import "@testing-library/jest-dom";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

(global as any).ResizeObserver = ResizeObserverMock;
(global.URL as any).createObjectURL = jest.fn(() => "blob:wealthtrack-thumbnail");
(global.URL as any).revokeObjectURL = jest.fn();
