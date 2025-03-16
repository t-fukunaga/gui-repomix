declare global {
    interface Window {
        electron: {
            openDirectory: () => Promise<string | null>;
            getDirectoryContents: (dirPath: string) => Promise<DirectoryItem[]>;
            runRepomix: (options: RepomixOptions) => Promise<{ stdout: string }>;
            saveFile: (content: string) => Promise<boolean>;
            copyToClipboard: (text: string) => Promise<boolean>;
            getRepomixDefaultFiles: (dirPath: string) => Promise<string[]>;
        };
    }

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
        style?: 'plain' | 'markdown' | 'xml';
        copy?: boolean;
        removeComments?: boolean;
        removeEmptyLines?: boolean;
        output?: string;
    }
}

export { };