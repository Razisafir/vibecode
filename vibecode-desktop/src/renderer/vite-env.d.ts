/// <reference types="vite/client" />

// Vite worker import declarations
declare module '*?worker' {
  const WorkerConstructor: new () => Worker;
  export default WorkerConstructor;
}
