import { app, BrowserWindow, ipcMain, dialog, clipboard } from 'electron';
import * as path from 'path';
import { exec } from 'child_process';
import * as fs from 'fs';

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    mainWindow.loadFile(path.join(__dirname, '../index.html'));

    // 開発時はDevToolsを開く
    mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// ディレクトリを選択するダイアログを開く
ipcMain.handle('open-directory', async (): Promise<string | null> => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openDirectory']
    });

    if (canceled) {
        return null;
    }

    return filePaths[0];
});

// ファイルを保存するダイアログを開く
ipcMain.handle('save-file', async (_: Electron.IpcMainInvokeEvent, content: string): Promise<boolean> => {
    const { canceled, filePath } = await dialog.showSaveDialog({
        filters: [
            { name: 'Text Files', extensions: ['txt'] },
            { name: 'Markdown Files', extensions: ['md'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });

    if (!canceled && filePath) {
        fs.writeFileSync(filePath, content);
        return true;
    }

    return false;
});

interface DirectoryItem {
    name: string;
    path: string;
    type: 'file' | 'directory';
    children?: DirectoryItem[];
}

// ディレクトリの内容を再帰的に取得する
ipcMain.handle('get-directory-contents', async (_: Electron.IpcMainInvokeEvent, dirPath: string): Promise<DirectoryItem[]> => {
    function readDirRecursive(dir: string): DirectoryItem[] {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        return entries.map(entry => {
            const fullPath = path.join(dir, entry.name);
            const relativePath = path.relative(dirPath, fullPath);

            if (entry.isDirectory()) {
                return {
                    name: entry.name,
                    path: relativePath,
                    type: 'directory' as const,
                    children: readDirRecursive(fullPath)
                };
            } else {
                return {
                    name: entry.name,
                    path: relativePath,
                    type: 'file' as const
                };
            }
        });
    }

    try {
        return readDirRecursive(dirPath);
    } catch (error) {
        console.error('Error reading directory:', error);
        return [];
    }
});

interface RepomixOptions {
    directories: string[];
    include?: string;
    ignore?: string;
    noGitignore?: boolean;
    noDefaultPatterns?: boolean;
    style?: string;
    copy?: boolean;
    removeComments?: boolean;
    removeEmptyLines?: boolean;
    output?: string;
}

// repomixコマンドを実行する
ipcMain.handle('run-repomix', async (_: Electron.IpcMainInvokeEvent, options: RepomixOptions): Promise<{ stdout: string }> => {
    return new Promise((resolve, reject) => {
        let command = 'repomix';

        // オプションを追加
        if (options.directories && options.directories.length > 0) {
            command += ` "${options.directories.join('" "')}"`;
        }

        if (options.include) {
            command += ` --include "${options.include}"`;
        }

        if (options.ignore) {
            command += ` -i "${options.ignore}"`;
        }

        if (options.noGitignore) {
            command += ' --no-gitignore';
        }

        if (options.style) {
            command += ` --style ${options.style}`;
        }

        if (options.copy) {
            command += ' --copy';
        }

        if (options.removeComments) {
            command += ' --remove-comments';
        }

        if (options.removeEmptyLines) {
            command += ' --remove-empty-lines';
        }

        console.log('Executing command:', command);

        exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
            if (error) {
                console.error('Command execution error:', error);
                console.error('stderr:', stderr);
                reject({ error: error, stderr: stderr });
                return;
            }

            resolve({ stdout: stdout });
        });
    });
});

// クリップボードにコピー
ipcMain.handle('copy-to-clipboard', async (_: Electron.IpcMainInvokeEvent, text: string): Promise<boolean> => {
    clipboard.writeText(text);
    return true;
});

// repomixのデフォルト対象ファイルを取得する
// repomixのデフォルト対象ファイルを取得する
ipcMain.handle('get-repomix-default-files', async (_: Electron.IpcMainInvokeEvent, dirPath: string): Promise<string[]> => {
    return new Promise((resolve, reject) => {
        // 一時的なファイル名を生成
        const tempFile = path.join(app.getPath('temp'), `repomix-temp-${Date.now()}.txt`);

        // 標準出力をファイルにリダイレクトし、デフォルト設定でrepomixを実行
        const command = `repomix "${dirPath}" -o "${tempFile}" --parsable-style`;

        console.log('Getting default files with command:', command);

        exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
            try {
                // コマンドが正常に実行されたか確認
                if (error) {
                    console.error('Command execution error:', error);
                    console.error('stderr:', stderr);
                    // エラーでも続行できるように空配列を返す
                    resolve([]);
                    return;
                }

                // 一時ファイルが存在するか確認
                if (fs.existsSync(tempFile)) {
                    // ファイルの内容を読み込む
                    const content = fs.readFileSync(tempFile, 'utf8');

                    // パターンを正規表現で作成（完全決め打ち）
                    // ================\nFile: ファイルパス\n================
                    const pattern = /={16}\r?\nFile: ([^\r\n]+)\r?\n={16}/g;
                    const files: string[] = [];

                    let match;
                    while ((match = pattern.exec(content)) !== null) {
                        if (match[1]) {
                            files.push(match[1].trim());
                        }
                    }

                    // 一時ファイルを削除
                    try {
                        fs.unlinkSync(tempFile);
                    } catch (e) {
                        console.error('Error deleting temp file:', e);
                    }

                    resolve(files);
                } else {
                    console.error('Temp file not found');
                    resolve([]);
                }
            } catch (parseError) {
                console.error('Error parsing repomix output:', parseError);
                resolve([]);
            }
        });
    });
});