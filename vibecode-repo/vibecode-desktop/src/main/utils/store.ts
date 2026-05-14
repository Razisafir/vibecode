import fs from 'fs';
import path from 'path';

export class JsonStore<T> {
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  read(): T | null {
    try {
      const data = fs.readFileSync(this.filePath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  write(data: T): void {
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  update(updater: (current: T | null) => T): T {
    const current = this.read();
    const updated = updater(current);
    this.write(updated);
    return updated;
  }
}
