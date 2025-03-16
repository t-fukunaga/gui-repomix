import { contextBridge, ipcRenderer } from 'electron';

// APIをウィンドウに公開
contextBridge.exposeInMainWorld('electron', {
    // ディレクトリ選択
    openDirectory: (): Promise<string | null> => ipcRenderer.invoke('open-directory'),

    // ディレクトリ内容の取得
    getDirectoryContents: (dirPath: string): Promise<DirectoryItem[]> =>
        ipcRenderer.invoke('get-directory-contents', dirPath),

    // repomixの実行
    runRepomix: (options: RepomixOptions): Promise<{ stdout: string }> =>
        ipcRenderer.invoke('run-repomix', options),

    // ファイル保存
    saveFile: (content: string): Promise<boolean> =>
        ipcRenderer.invoke('save-file', content),

    // クリップボードへのコピー
    copyToClipboard: (text: string): Promise<boolean> =>
        ipcRenderer.invoke('copy-to-clipboard', text),

    // repomixのデフォルト対象ファイルを取得
    getRepomixDefaultFiles: (dirPath: string): Promise<string[]> =>
        ipcRenderer.invoke('get-repomix-default-files', dirPath),

    // ファイル内容を読み取る
    readFileContent: (filePath: string): Promise<string> =>
        ipcRenderer.invoke('read-file-content', filePath)
});

// このファイルで型を使用するための型定義
interface DirectoryItem {
    name: string;
    path: string;
    type: 'file' | 'directory';
    children?: DirectoryItem[];
}

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