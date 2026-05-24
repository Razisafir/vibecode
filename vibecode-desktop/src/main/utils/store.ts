import {
  kernelFsExistsInternal,
  kernelFsMkdirInternalSync,
  kernelFsReadSync,
  kernelFsWriteInternalSync,
} from '../kernel/kernel-fs';
import path from 'path';

export class JsonStore<T> {
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    const dir = path.dirname(filePath);
    if (!kernelFsExistsInternal(dir)) {
      kernelFsMkdirInternalSync(dir);
    }
  }

  read(): T | null {
    try {
      const data = kernelFsReadSync(this.filePath);
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  write(data: T): void {
    kernelFsWriteInternalSync(this.filePath, JSON.stringify(data, null, 2));
  }

  update(updater: (current: T | null) => T): T {
    const current = this.read();
    const updated = updater(current);
    this.write(updated);
    return updated;
  }
}
