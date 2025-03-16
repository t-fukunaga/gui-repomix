document.addEventListener('DOMContentLoaded', () => {
    // highlight.jsの型定義
    interface HLJSApi {
        highlightElement: (element: HTMLElement) => void;
        highlightAuto: (code: string) => { language: string | null };
    }

    // highlight.jsの初期化
    if (typeof (window as any)['hljs'] !== 'undefined') {
        console.log('highlight.jsが正常に読み込まれました');
    } else {
        console.warn('highlight.jsが読み込まれていません。構文ハイライトは無効になります。');
    }
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

    // highlight.jsが利用可能かどうかをチェックする関数
    function isHighlightJsAvailable(): boolean {
        return typeof (window as any)['hljs'] !== 'undefined';
    }

    // 状態の保持
    let currentDirectory: string | null = null;
    let selectedFiles: Record<string, 'file' | 'directory'> = {};
    let outputText: string = '';
    let defaultFiles: Set<string> = new Set();
    let useDefaultFilesOnly: boolean = true;
    let currentPreviewPath: string | null = null;
    let currentPreviewLanguage: string | null = null;

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

    // ファイル拡張子から言語を推測する
    function getLanguageFromFileName(fileName: string): string | null {
        const extensionMap: Record<string, string | null> = {
            'js': 'javascript',
            'ts': 'typescript',
            'jsx': 'javascript',
            'tsx': 'typescript',
            'py': 'python',
            'html': 'html',
            'css': 'css',
            'json': 'json',
            'xml': 'xml',
            'md': 'markdown',
            'java': 'java',
            'c': 'c',
            'cpp': 'cpp',
            'cc': 'cpp',
            'h': 'cpp',
            'hpp': 'cpp',
            'cs': 'csharp',
            'go': 'go',
            'rs': 'rust',
            'rb': 'ruby',
            'php': 'php',
            'sh': 'shell',
            'bash': 'shell',
            'zsh': 'shell',
            'sql': 'sql',
            'txt': null,
        };

        const extension = fileName.split('.').pop()?.toLowerCase() || '';
        return extensionMap[extension] || null;
    }

    // 言語セレクターを生成する
    function createLanguageSelector(currentLanguage: string | null): HTMLDivElement {
        const languages = [
            { value: 'auto', name: '自動検出' },
            { value: 'plaintext', name: 'プレーンテキスト' },
            { value: 'javascript', name: 'JavaScript' },
            { value: 'typescript', name: 'TypeScript' },
            { value: 'python', name: 'Python' },
            { value: 'html', name: 'HTML' },
            { value: 'css', name: 'CSS' },
            { value: 'json', name: 'JSON' },
            { value: 'xml', name: 'XML' },
            { value: 'markdown', name: 'Markdown' },
            { value: 'java', name: 'Java' },
            { value: 'cpp', name: 'C/C++' },
            { value: 'csharp', name: 'C#' },
            { value: 'go', name: 'Go' },
            { value: 'rust', name: 'Rust' },
            { value: 'shell', name: 'Shell' },
            { value: 'sql', name: 'SQL' },
        ];

        const container = document.createElement('div');
        container.className = 'language-selector';

        const label = document.createElement('label');
        label.textContent = '言語: ';
        container.appendChild(label);

        const select = document.createElement('select');
        select.id = 'language-select';

        languages.forEach(lang => {
            const option = document.createElement('option');
            option.value = lang.value;
            option.textContent = lang.name;

            // 現在の言語を選択
            if (currentLanguage === lang.value ||
                (currentLanguage === null && lang.value === 'auto')) {
                option.selected = true;
            }

            select.appendChild(option);
        });

        // 言語選択時のイベント
        select.addEventListener('change', () => {
            const selectedValue = select.value;
            if (currentPreviewPath) {
                applyHighlight(selectedValue === 'auto' ? null : selectedValue);
            }
        });

        container.appendChild(select);
        return container;
    }

    // 構文ハイライトを適用する
    function applyHighlight(language: string | null): void {
        if (!currentPreviewPath) return;

        const previewContent = document.querySelector('.preview-content') as HTMLElement;
        if (!previewContent) return;

        const content = previewContent.textContent || '';

        // highlight.jsが使用可能かどうかチェック
        if (!isHighlightJsAvailable()) {
            console.warn('highlight.jsが読み込まれていません。構文ハイライトは適用されません。');
            previewContent.textContent = content;
            return;
        }

        try {
            // コードコンテナの作成
            const codeElement = document.createElement('code');

            // 言語クラスの設定
            if (language) {
                codeElement.className = `language-${language}`;
                currentPreviewLanguage = language;
            } else {
                // 自動検出の場合
                const hljs = (window as any)['hljs'] as HLJSApi;
                const result = hljs.highlightAuto(content);
                currentPreviewLanguage = result.language || 'plaintext';
                codeElement.className = `language-${currentPreviewLanguage}`;
            }

            codeElement.textContent = content;

            // プレビューコンテンツを更新
            previewContent.innerHTML = '';
            previewContent.appendChild(codeElement);

            // ハイライト適用
            const hljs = (window as any)['hljs'] as HLJSApi;
            hljs.highlightElement(codeElement);

            // 言語セレクタを更新
            updateLanguageSelector();
        } catch (err) {
            console.error('構文ハイライト適用中にエラーが発生しました:', err);
            previewContent.textContent = content; // エラー時には通常のテキスト表示に戻す
        }
    }

    // 言語セレクタを更新する
    function updateLanguageSelector(): void {
        // highlight.jsが使用できない場合はセレクタを表示しない
        if (!isHighlightJsAvailable()) return;

        const existingSelector = document.querySelector('.language-selector');
        if (existingSelector) {
            existingSelector.remove();
        }

        const selector = createLanguageSelector(currentPreviewLanguage);
        const previewHeader = document.querySelector('.preview-header');
        if (previewHeader) {
            const closeBtn = previewHeader.querySelector('.preview-close-btn');
            if (closeBtn) {
                previewHeader.insertBefore(selector, closeBtn);
            } else {
                previewHeader.appendChild(selector);
            }
        }
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

            // ファイル名から言語を推測
            currentPreviewLanguage = getLanguageFromFileName(fileName);

            // ファイルの内容を取得
            const content = await window.electron.readFileContent(path);

            // プレビューヘッダーを作成
            const previewHeader = document.createElement('div');
            previewHeader.className = 'preview-header';

            const previewTitle = document.createElement('div');
            previewTitle.className = 'preview-title';
            previewTitle.textContent = `プレビュー: ${fileName}`;
            previewHeader.appendChild(previewTitle);

            // 言語セレクタの追加
            const languageSelector = createLanguageSelector(currentPreviewLanguage);
            previewHeader.appendChild(languageSelector);

            const closeBtn = document.createElement('button');
            closeBtn.className = 'preview-close-btn';
            closeBtn.textContent = '×';
            closeBtn.addEventListener('click', clearPreview);
            previewHeader.appendChild(closeBtn);

            // プレビューコンテナの作成
            const previewContainer = document.createElement('div');
            previewContainer.className = 'preview-container';

            // プレビュー内容を作成
            const previewContent = document.createElement('pre');
            previewContent.className = 'preview-content';

            // highlight.jsが利用可能かチェック
            if (isHighlightJsAvailable()) {
                try {
                    // コード要素の作成
                    const codeElement = document.createElement('code');

                    // 言語クラスの設定（推測した言語または自動検出）
                    if (currentPreviewLanguage) {
                        codeElement.className = `language-${currentPreviewLanguage}`;
                    }

                    codeElement.textContent = content;
                    previewContent.appendChild(codeElement);
                    previewContainer.appendChild(previewContent);

                    // 出力エリアに表示
                    outputContent.innerHTML = '';
                    outputContent.appendChild(previewHeader);
                    outputContent.appendChild(previewContainer);

                    // 構文ハイライト適用
                    const hljs = (window as any)['hljs'] as HLJSApi;
                    hljs.highlightElement(codeElement);
                } catch (err) {
                    console.error('構文ハイライト適用中にエラーが発生しました:', err);
                    // エラーが発生した場合は通常のテキスト表示にフォールバック
                    previewContent.textContent = content;
                    previewContainer.appendChild(previewContent);

                    outputContent.innerHTML = '';
                    outputContent.appendChild(previewHeader);
                    outputContent.appendChild(previewContainer);
                }
            } else {
                // highlight.jsが利用できない場合は通常のテキスト表示
                previewContent.textContent = content;
                previewContainer.appendChild(previewContent);

                outputContent.innerHTML = '';
                outputContent.appendChild(previewHeader);
                outputContent.appendChild(previewContainer);
            }

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
            currentPreviewLanguage = null;

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

            // repomixの出力も構文ハイライト対応（XMLやMarkdownの場合）
            if (isHighlightJsAvailable() && (styleSelect.value === 'xml' || styleSelect.value === 'markdown')) {
                try {
                    const code = document.createElement('code');
                    code.className = styleSelect.value === 'xml' ? 'language-xml' : 'language-markdown';
                    code.textContent = outputText;
                    pre.appendChild(code);

                    // 非同期で適用（DOMに追加後）
                    setTimeout(() => {
                        try {
                            const hljs = (window as any)['hljs'] as HLJSApi;
                            hljs.highlightElement(code);
                        } catch (err) {
                            console.error('repomix出力のハイライト適用中にエラーが発生しました:', err);
                            // エラー時はフォールバック
                            pre.textContent = outputText;
                        }
                    }, 0);
                } catch (err) {
                    console.error('repomix出力のハイライト設定中にエラーが発生しました:', err);
                    pre.textContent = outputText;
                }
            } else {
                pre.textContent = outputText;
            }

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

    // ファイル名から適切なhighlight.js言語識別子を取得
    function getLanguageIdentifier(fileName: string): string {
        const ext = fileName.split('.').pop()?.toLowerCase();
        const languageMap: Record<string, string> = {
            'js': 'javascript',
            'ts': 'typescript',
            'py': 'python',
            'html': 'html',
            'css': 'css',
            'json': 'json',
            'xml': 'xml',
            'md': 'markdown',
            'java': 'java',
            'c': 'c',
            'cpp': 'cpp',
            'cs': 'csharp',
            'go': 'go',
            'rs': 'rust',
            'sh': 'shell',
            'bash': 'shell',
            'sql': 'sql'
        };

        return ext && languageMap[ext] ? languageMap[ext] : 'plaintext';
    }
});