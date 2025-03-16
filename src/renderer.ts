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
    const defaultFilesOnlyCheckbox = document.getElementById('default-files-only-checkbox') as HTMLInputElement;
    const runBtn = document.getElementById('run-btn') as HTMLButtonElement;
    const copyBtn = document.getElementById('copy-btn') as HTMLButtonElement;
    const saveBtn = document.getElementById('save-btn') as HTMLButtonElement;
    const outputContent = document.getElementById('output-content') as HTMLDivElement;

    // 状態の保持
    let currentDirectory: string | null = null;
    let selectedFiles: Record<string, 'file' | 'directory'> = {};
    let outputText: string = '';
    let defaultFiles: Set<string> = new Set();
    let useDefaultFilesOnly: boolean = true;
    let currentPreviewPath: string | null = null;

    // デフォルトファイルのみ表示の切り替え
    defaultFilesOnlyCheckbox.addEventListener('change', () => {
        useDefaultFilesOnly = defaultFilesOnlyCheckbox.checked;
        if (currentDirectory) {
            loadDirectoryContents();
        }
    });

    // ディレクトリを選択する
    selectDirBtn.addEventListener('click', async () => {
        const dir = await window.electron.openDirectory();
        if (dir) {
            currentDirectory = dir;
            currentDirPath.textContent = dir;
            currentDirContainer.classList.remove('hidden');

            // repomixのデフォルト対象ファイルを取得
            try {
                showNotification('デフォルトファイルを取得中...');
                const files = await window.electron.getRepomixDefaultFiles(dir);
                defaultFiles = new Set(files);
                console.log('Default files:', files);
            } catch (err) {
                console.error('Failed to get default files:', err);
                defaultFiles = new Set();
            }

            loadDirectoryContents();
            runBtn.disabled = false;
        }
    });

    // ディレクトリの内容を読み込む
    async function loadDirectoryContents(): Promise<void> {
        if (!currentDirectory) return;

        try {
            // ディレクトリの内容を取得
            const contents = await window.electron.getDirectoryContents(currentDirectory);

            // デフォルトファイルのみ表示モードの場合、ファイルをフィルタリング
            let filteredContents: DirectoryItem[] = contents;
            if (useDefaultFilesOnly && defaultFiles.size > 0) {
                filteredContents = filterDirectoryItems(contents);
            }

            // 親ディレクトリ（選択したディレクトリ自体）を追加
            const dirName = currentDirectory.split(/[/\\]/).pop() || currentDirectory;
            const rootItem: DirectoryItem = {
                name: dirName,
                path: '',
                type: 'directory',
                children: filteredContents
            };

            // ルートディレクトリとしてレンダリング
            renderFileTree([rootItem]);
            selectedFiles = {};

            // デフォルトファイルを自動選択する
            if (defaultFiles.size > 0) {
                autoSelectDefaultFiles();
            }
        } catch (err) {
            showError(`ディレクトリの読み込みに失敗しました: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    // デフォルトファイルに基づいてディレクトリアイテムをフィルタリングする
    function filterDirectoryItems(items: DirectoryItem[]): DirectoryItem[] {
        return items.map(item => {
            // ファイルの場合
            if (item.type === 'file') {
                // デフォルトファイルリストに含まれている場合のみ含める
                return defaultFiles.has(item.path) ? item : null;
            }

            // ディレクトリの場合は子要素を再帰的にフィルタリング
            const filteredChildren = item.children ?
                filterDirectoryItems(item.children).filter(Boolean) as DirectoryItem[] :
                [];

            // フィルタリング後の子要素が存在する場合のみディレクトリを含める
            if (filteredChildren.length > 0) {
                return {
                    ...item,
                    children: filteredChildren
                };
            }

            return null;
        }).filter(Boolean) as DirectoryItem[]; // nullを除外
    }

    // デフォルトファイルを自動選択する
    function autoSelectDefaultFiles(): void {
        // ツリー内のすべてのチェックボックスを取得
        const checkboxes = document.querySelectorAll('input[type="checkbox"][data-path]');

        // 各チェックボックスをチェック
        checkboxes.forEach((checkbox) => {
            const path = (checkbox as HTMLInputElement).dataset.path || '';
            const type = (checkbox as HTMLInputElement).dataset.type as 'file' | 'directory';

            // ファイルの場合、デフォルトファイルリストに含まれていればチェックを入れる
            if (type === 'file' && defaultFiles.has(path)) {
                (checkbox as HTMLInputElement).checked = true;
                selectedFiles[path] = type;
            }
            // ディレクトリの場合、デフォルトファイル機能がオンで、そのディレクトリ内にデフォルトファイルが含まれていればチェックを入れる
            else if (type === 'directory' && useDefaultFilesOnly) {
                const hasDefaultFile = Array.from(defaultFiles).some(file =>
                    file.startsWith(path + '/') || (path === '' && defaultFiles.size > 0));

                if (hasDefaultFile) {
                    (checkbox as HTMLInputElement).checked = true;
                    selectedFiles[path] = type;
                }
            }
        });
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

        // ルートフォルダを自動で展開
        const rootExpandIcon = tree.querySelector('.expand-icon') as HTMLSpanElement;
        if (rootExpandIcon) {
            // すでに展開されている場合は何もしない
            if (rootExpandIcon.dataset.expanded === 'false') {
                rootExpandIcon.click();
            }
        }
    }

    // ツリーアイテムを作成する
    function createTreeItem(item: DirectoryItem, level: number = 0): HTMLDivElement {
        const itemElement = document.createElement('div');
        itemElement.className = 'file-tree-item';

        const header = document.createElement('div');
        header.className = 'item-header';
        header.style.paddingLeft = `${level * 20}px`;

        const isDirectory = item.type === 'directory';

        // デフォルトファイルかどうかの判定
        let isDefaultFile = false;
        let containsDefaultFiles = false;

        if (item.type === 'file') {
            isDefaultFile = defaultFiles.has(item.path);
            if (isDefaultFile) {
                header.classList.add('default-file');
            }
        } else if (isDirectory) {
            // このディレクトリ内に1つでもデフォルトファイルがあるか確認
            containsDefaultFiles = Array.from(defaultFiles).some(file =>
                file.startsWith(item.path + '/') || (item.path === '' && defaultFiles.size > 0));

            if (containsDefaultFiles) {
                header.classList.add('contains-default-files');
            }
        }

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
            const isChecked = checkbox.checked;

            // 現在のアイテムの選択状態を更新
            if (isChecked) {
                selectedFiles[item.path] = item.type;
            } else {
                delete selectedFiles[item.path];
            }

            // ディレクトリの場合、子要素の選択状態も更新
            if (isDirectory) {
                // すべての子チェックボックスを選択/非選択にする
                const childCheckboxes = itemElement.querySelectorAll('.item-children input[type="checkbox"]');
                Array.from(childCheckboxes).forEach((childCheckbox) => {
                    (childCheckbox as HTMLInputElement).checked = isChecked;

                    // selectedFiles オブジェクトも更新
                    const childPath = (childCheckbox as HTMLInputElement).dataset.path || '';
                    const childType = (childCheckbox as HTMLInputElement).dataset.type as 'file' | 'directory';

                    if (isChecked) {
                        selectedFiles[childPath] = childType;
                    } else {
                        delete selectedFiles[childPath];
                    }
                });

                // 下位ディレクトリを展開して選択項目を見えるようにする
                if (isChecked) {
                    const expandIcon = header.querySelector('.expand-icon') as HTMLSpanElement;
                    if (expandIcon && expandIcon.dataset.expanded === 'false') {
                        expandIcon.click(); // 子ディレクトリを展開
                    }
                }
            }
        });

        // ファイルクリックでプレビュー表示
        if (item.type === 'file') {
            header.addEventListener('click', async (e) => {
                // チェックボックスをクリックした場合はプレビューしない
                if ((e.target as HTMLElement).tagName === 'INPUT') {
                    return;
                }

                e.stopPropagation();
                await previewFile(item.path, item.name);
            });
            // ホバーエフェクト
            header.classList.add('file-clickable');
        }

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

    // ファイルをプレビュー表示
    async function previewFile(path: string, fileName: string): Promise<void> {
        if (!currentDirectory) return;

        try {
            // アウトプットエリアをクリア
            clearError();
            outputContent.innerHTML = '<div class="loading">ファイルを読み込み中...</div>';

            // プレビューモードに切り替え
            outputContent.classList.add('preview-mode');
            currentPreviewPath = path;

            // ファイルの内容を取得
            const content = await window.electron.readFileContent(path);

            // プレビューヘッダーを作成
            const previewHeader = document.createElement('div');
            previewHeader.className = 'preview-header';

            const previewTitle = document.createElement('div');
            previewTitle.className = 'preview-title';
            previewTitle.textContent = `プレビュー: ${fileName}`;
            previewHeader.appendChild(previewTitle);

            const closeBtn = document.createElement('button');
            closeBtn.className = 'preview-close-btn';
            closeBtn.textContent = '×';
            closeBtn.addEventListener('click', clearPreview);
            previewHeader.appendChild(closeBtn);

            // プレビュー内容を作成
            const previewContent = document.createElement('pre');
            previewContent.className = 'preview-content';
            previewContent.textContent = content;

            // 出力エリアに表示
            outputContent.innerHTML = '';
            outputContent.appendChild(previewHeader);
            outputContent.appendChild(previewContent);

            // ボタンを無効化
            copyBtn.disabled = true;
            saveBtn.disabled = true;

        } catch (err) {
            showError(`ファイルの読み込みに失敗しました: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    // プレビューをクリアする
    function clearPreview(): void {
        if (currentPreviewPath) {
            outputContent.classList.remove('preview-mode');
            currentPreviewPath = null;

            // デフォルトの空の状態に戻す
            outputContent.innerHTML = '<div class="empty-state">repomixを実行すると、ここに出力が表示されます</div>';

            // ボタンの状態を更新
            copyBtn.disabled = true;
            saveBtn.disabled = true;
        }
    }

    // repomixを実行する
    runBtn.addEventListener('click', async () => {
        if (!currentDirectory) {
            showError('ディレクトリを選択してください');
            return;
        }

        // プレビューモードを解除
        if (currentPreviewPath) {
            clearPreview();
        }

        const selectedFilePaths = Object.keys(selectedFiles).filter(path => selectedFiles[path] === 'file');
        const selectedDirPaths = Object.keys(selectedFiles).filter(path => selectedFiles[path] === 'directory');

        // トップディレクトリが選択されているか確認
        const hasRootDir = selectedDirPaths.includes('');

        // 何も選択されておらず、トップディレクトリも選択されていない場合はエラー
        if (selectedFilePaths.length === 0 && selectedDirPaths.length === 0) {
            showError('少なくとも1つのファイルまたはフォルダを選択してください');
            return;
        }

        setProcessing(true);
        clearError();

        try {
            const options: RepomixOptions = {
                directories: [currentDirectory],
                style: styleSelect.value as "plain" | "markdown" | "xml",
                removeComments: removeCommentsCheckbox.checked,
                removeEmptyLines: removeEmptyLinesCheckbox.checked,
                copy: copyCheckbox.checked
            };

            // トップディレクトリが選択されていない場合のみincludeオプションを追加
            if (!hasRootDir) {
                const includePatterns = [
                    ...selectedFilePaths,
                    ...selectedDirPaths.map(dir => `${dir}/**`)
                ].join(',');

                if (includePatterns) {
                    options.include = includePatterns;
                }
            }

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