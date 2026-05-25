// VibeCode System Runtime - Menu Builder v8.0
// Constructs application menus with role-based and platform-specific support

export interface MenuTemplate {
  label?: string;
  type?: 'normal' | 'separator' | 'submenu' | 'checkbox' | 'radio';
  accelerator?: string;
  click?: () => void;
  submenu?: MenuTemplate[];
  role?: string;
  enabled?: boolean;
  visible?: boolean;
  checked?: boolean;
}

export class MenuBuilder {
  private template: MenuTemplate[] = [];

  addFileMenu(extraItems?: MenuTemplate[]): MenuBuilder {
    const items: MenuTemplate[] = [];
    
    if (process.platform === 'darwin') {
      items.push({ label: 'About VibeCode', role: 'about' });
      items.push({ type: 'separator' });
    }

    items.push({ label: 'Preferences', accelerator: 'CmdOrCtrl+,', click: () => {} });
    items.push({ type: 'separator' });
    items.push({ label: 'Quit', accelerator: 'CmdOrCtrl+Q', role: 'quit' });

    if (extraItems) {
      items.push(...extraItems);
    }

    this.template.push({ label: 'File', submenu: items });
    return this;
  }

  addEditMenu(): MenuBuilder {
    this.template.push({
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', role: 'redo' },
        { type: 'separator' },
        { label: 'Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' },
        { label: 'Select All', accelerator: 'CmdOrCtrl+A', role: 'selectAll' },
      ],
    });
    return this;
  }

  addViewMenu(): MenuBuilder {
    this.template.push({
      label: 'View',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', role: 'reload' },
        { label: 'Force Reload', accelerator: 'Shift+CmdOrCtrl+R', role: 'forceReload' },
        { label: 'Toggle Developer Tools', accelerator: 'Alt+CmdOrCtrl+I', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: 'Actual Size', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
        { label: 'Zoom In', accelerator: 'CmdOrCtrl+Plus', role: 'zoomIn' },
        { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
        { type: 'separator' },
        { label: 'Toggle Full Screen', accelerator: 'F11', role: 'togglefullscreen' },
      ],
    });
    return this;
  }

  addPluginMenu(plugins: { id: string; name: string }[]): MenuBuilder {
    if (plugins.length === 0) return this;

    this.template.push({
      label: 'Plugins',
      submenu: plugins.map(p => ({
        label: p.name,
        type: 'checkbox' as const,
        checked: true,
        click: () => {},
      })),
    });
    return this;
  }

  addHelpMenu(): MenuBuilder {
    this.template.push({
      label: 'Help',
      submenu: [
        { label: 'Documentation', click: () => {} },
        { label: 'Report Issue', click: () => {} },
        { type: 'separator' },
        { label: 'Check for Updates', click: () => {} },
      ],
    });
    return this;
  }

  addItem(item: MenuTemplate): MenuBuilder {
    this.template.push(item);
    return this;
  }

  build(): MenuTemplate[] {
    return [...this.template];
  }

  reset(): MenuBuilder {
    this.template = [];
    return this;
  }
}
