document.addEventListener('DOMContentLoaded', () => {
    // 要素の取得
    const selectDirBtn = document.getElementById('select-dir-btn') as HTMLButtonElement;
    const currentDirContainer = document.getElementById('current-dir-container') as HTMLDivElement;
    const currentDirPath = document.getElementById('current-dir-path') as HTMLSpanElement;
    const fileTreeContent = document.getElementById('file-tree-content') as HTMLDivElement;
    const styleSelect = document.getElementById('style-select') as HTMLSelectElement;
    const removeCommentsCheckbox = document.getElementById('remove-comments-checkbox') as HTMLInputElement;
    const removeEmptyLinesCheckbox = document.getElementById('remove-empty-lines-checkbox') as HTMLInputElement;
    const copyCheckbox = document.getElementById('copy-checkbox') as HTMLInputElement;
    const runBtn = document.getElementById('run-btn') as HTMLButtonElement;
    const copyBtn = document.getElementById('copy-btn') as HTMLButtonElement;
    const saveBtn = document.getElementById('save-btn') as HTMLButtonElement;
    const outputContent = document.getElementById('output-content') as HTMLDivElement;

    // 状態の保持
    let currentDirectory: string | null = null;
    let selectedFiles: Record<string, 'file' | 'directory'> = {};
    let outputText: string = '';

    // ディレクトリを選択する
    selectDirBtn.addEventListener('click', async () => {
        const dir = await window.electron.openDirectory();
        if (dir) {
            currentDirectory = dir;
            currentDirPath.textContent = dir;
            currentDirContainer.classList.remove('hidden');
            loadDirectoryContents();
            runBtn.disabled = false;
        }
    });

    // ディレクトリの内容を読み込む
    async function loadDirectoryContents(): Promise<void> {
        if (!currentDirectory) return;

        try {
            const contents = await window.electron.getDirectoryContents(currentDirectory);
            renderFileTree(contents);
            selectedFiles = {};
        } catch (err) {
            showError(`ディレクトリの読み込みに失敗しました: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    // ファイルツリーをレンダリングする
    function renderFileTree(items: DirectoryItem[]): void {
        fileTreeContent.innerHTML = '';

        if (items.length === 0) {
            fileTreeContent.innerHTML = '<div class="empty-state">ディレクトリが空です</div>';
            return;
        }

        const tree = document.createElement('div');
        tree.className = 'tree';

        items.forEach(item => {
            const itemElement = createTreeItem(item);
            tree.appendChild(itemElement);
        });

        fileTreeContent.appendChild(tree);
    }

    // ツリーアイテムを作成する
    function createTreeItem(item: DirectoryItem, level: number = 0): HTMLDivElement {
        const itemElement = document.createElement('div');
        itemElement.className = 'file-tree-item';

        const header = document.createElement('div');
        header.className = 'item-header';
        header.style.paddingLeft = `${level * 20}px`;

        const isDirectory = item.type === 'directory';

        // 展開アイコン（ディレクトリの場合）
        if (isDirectory) {
            const expandIcon = document.createElement('span');
            expandIcon.className = 'expand-icon';
            expandIcon.textContent = '▼';
            expandIcon.dataset.expanded = 'true';
            header.appendChild(expandIcon);

            expandIcon.addEventListener('click', (e) => {
                e.stopPropagation();
                const isExpanded = expandIcon.dataset.expanded === 'true';
                expandIcon.textContent = isExpanded ? '▶' : '▼';
                expandIcon.dataset.expanded = isExpanded ? 'false' : 'true';

                const children = itemElement.querySelector('.item-children');
                if (children) {
                    (children as HTMLDivElement).style.display = isExpanded ? 'none' : 'block';
                }
            });
        }

        // アイテムアイコン
        const itemIcon = document.createElement('span');
        itemIcon.className = 'item-icon';
        itemIcon.textContent = isDirectory ? '📁' : '📄';
        header.appendChild(itemIcon);

        // チェックボックス
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.dataset.path = item.path;
        checkbox.dataset.type = item.type;
        header.appendChild(checkbox);

        // アイテム名
        const itemName = document.createElement('span');
        itemName.className = 'item-name';
        itemName.textContent = item.name;
        header.appendChild(itemName);

        // チェックボックスの変更イベント
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                selectedFiles[item.path] = item.type;
            } else {
                delete selectedFiles[item.path];
            }
        });

        itemElement.appendChild(header);

        // 子要素（ディレクトリの場合）
        if (isDirectory && item.children && item.children.length > 0) {
            const children = document.createElement('div');
            children.className = 'item-children';

            item.children.forEach(child => {
                const childElement = createTreeItem(child, level + 1);
                children.appendChild(childElement);
            });

            itemElement.appendChild(children);
        }

        return itemElement;
    }

    // repomixを実行する
    runBtn.addEventListener('click', async () => {
        if (!currentDirectory) {
            showError('ディレクトリを選択してください');
            return;
        }

        const selectedFilePaths = Object.keys(selectedFiles).filter(path => selectedFiles[path] === 'file');
        const selectedDirPaths = Object.keys(selectedFiles).filter(path => selectedFiles[path] === 'directory');

        if (selectedFilePaths.length === 0 && selectedDirPaths.length === 0) {
            showError('少なくとも1つのファイルまたはフォルダを選択してください');
            return;
        }

        const includePatterns = [
            ...selectedFilePaths,
            ...selectedDirPaths.map(dir => `${dir}/**`)
        ].join(',');

        setProcessing(true);
        clearError();

        try {
            const options: RepomixOptions = {
                directories: [currentDirectory],
                include: includePatterns,
                style: styleSelect.value as "plain" | "markdown" | "xml",
                removeComments: removeCommentsCheckbox.checked,
                removeEmptyLines: removeEmptyLinesCheckbox.checked,
                copy: copyCheckbox.checked
            };

            const result = await window.electron.runRepomix(options);
            outputText = result.stdout;

            // 出力を表示
            outputContent.innerHTML = '';
            const pre = document.createElement('pre');
            pre.className = 'output-text';
            pre.textContent = outputText;
            outputContent.appendChild(pre);

            // ボタンを有効化
            copyBtn.disabled = false;
            saveBtn.disabled = false;

        } catch (err: any) {
            showError('repomixの実行に失敗しました: ' + (err.stderr || (err.error && err.error.message) || '不明なエラー'));
        } finally {
            setProcessing(false);
        }
    });

    // クリップボードにコピー
    copyBtn.addEventListener('click', async () => {
        if (outputText) {
            await window.electron.copyToClipboard(outputText);
            showNotification('出力をクリップボードにコピーしました');
        }
    });

    // ファイルに保存
    saveBtn.addEventListener('click', async () => {
        if (outputText) {
            const saved = await window.electron.saveFile(outputText);
            if (saved) {
                showNotification('ファイルを保存しました');
            }
        }
    });

    // 処理中の状態を設定
    function setProcessing(isProcessing: boolean): void {
        runBtn.disabled = isProcessing;
        runBtn.textContent = isProcessing ? '処理中...' : '実行';
    }

    // エラーを表示
    function showError(message: string): void {
        clearError();

        const errorElement = document.createElement('div');
        errorElement.className = 'error-message';
        errorElement.textContent = message;

        outputContent.prepend(errorElement);
    }

    // エラーをクリア
    function clearError(): void {
        const errorElement = outputContent.querySelector('.error-message');
        if (errorElement) {
            errorElement.remove();
        }
    }

    // 通知を表示
    function showNotification(message: string): void {
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = message;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => {
                notification.remove();
            }, 500);
        }, 2000);
    }
});