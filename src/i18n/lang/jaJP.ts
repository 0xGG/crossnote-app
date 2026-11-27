import type { enUS } from "./enUS";

export const jaJP = {
  translation: {
    "backup/export": "ノートブックを ZIP で書き出す",
    "backup/title": "「{{notebook}}」を ZIP で書き出す",
    "backup/private-files":
      "ZIP には隠しファイルや Git の追跡対象外のファイルも含まれ、非公開の情報が入る場合があります。外部メディアの URL はそのままです。",
    "backup/disk-links":
      "Chrome がフォルダーから読み取れるファイルをバックアップします。シンボリックリンクは Chrome によって表示されない場合があります。",
    "backup/preparing": "ZIP を準備しています…",
    "backup/windows-paths":
      "次のパスは Windows で元の名前のまま展開できない場合があります。ZIP 内のパスは変更されません。",
    "backup/download": "ZIP をダウンロード",
    "backup/failed": "ノートブックを書き出せませんでした。",
    "backup/read-error": "「{{file}}」を読み取れませんでした。",
    "backup/symbolic-link":
      "シンボリックリンク「{{file}}」を含められませんでした。",
    "backup/too-large":
      "ノートブックが ZIP のサイズまたは項目数の上限を超えています。",
    "backup/sync-recovery":
      "「ダウンロード」をやり直して中断した同期を完了してから、ノートブックを書き出してください。",
    "attachment/insert-image": "画像を挿入",
    "attachment/ignored":
      "この添付ファイルのパスは Git で無視されています。リンクは挿入されず、保存済みファイルは assets に残ります。ノートブックの除外ルールを確認してください。",
    "attachment/size":
      "添付ファイルは 20 MiB 以下にしてください。リンクは挿入されませんでした。",
    "attachment/type":
      "このファイル形式はサポートされていません。画像、音声、動画を選択してください。",
    "attachment/location":
      "ノートまたは挿入位置が変更されました。リンクは挿入されず、保存済みファイルは assets に残ります。",
    "attachment/failed":
      "添付ファイルを保存できませんでした。リンクは挿入されませんでした",
    "attachment/playback-failed":
      "再生できません。ファイル、接続、ブラウザーの対応形式を確認してください。",
    "search/notes": "ノートを検索する",

    // Account
    "account/Anonymous": "匿名",

    // General
    "general/cancel": "キャンセル",
    "general/add": "追加",
    "general/adding": "追加",
    "general/created-at": "創建於",
    "general/modified-at": "修改於",
    "general/date-created": "作成日",
    "general/date-modified": "更新日",
    "general/title": "表題",
    "general/loading": "讀取中 ...",
    "general/note-not-found": "ノートが見つかりません",
    "error/failed-to-load-note": "ノートを読み込めませんでした",
    "general/update": "更新",
    "general/close": "閉じる",
    "general/open-menu": "メニューを開く",
    "general/expand": "展開する",
    "general/collapse": "折りたたむ",
    "general/Note": "ノート",
    "general/notes": "ノート",
    "general/Settings": "設定",
    "general/Username": "ユーザー名",
    "general/Password": "パスワード",
    "general/echomd": "編集",
    "general/edit-note-alias": "ノート エイリアスの編集",
    "general/no-aliases": "エイリアスなし",
    "general/add-an-alias": "エイリアスを追加する",
    "general/Untitled": "無題",
    "general/Print": "印刷 / PDF 出力",
    "general/Share": "シェア",
    "Editor": "編集者",
    "general/math-preview": "数学プレビュー",
    "general/this-note-is-empty": "このノートには内容がありません",
    "general/no-notes-found": "他のノートは見つかりませんでした",
    "general/Save": "保存",
    "general/Delete": "削除する",
    "general/new-note": "新しいノート",
    "general/note-menu": "ノートメニュー",
    "general/sort-notes": "ノートを並べ替える",
    "general/table-of-contents": "目次",
    "general/Upload": "アップロードする",
    "general/Uploading": "アップロードしています",
    "general/please-wait": "しばらくお待ちください...",
    "general/Download": "ダウンロード",
    "general/Notebooks": "ノートブック",
    "general/add-a-notebook": "ノートブックを追加する",
    "general/add-a-note": "ノートを追加する",
    "general/configure-the-notebook": "ノートブックを構成する",
    "general/notebook-name": "ノートブック名",
    "general/git-repository": "Git リポジトリ",
    "general/clone-a-git-repository": "Git リポジトリのクローン作成",
    "general/optional": "オプション",
    "general/url": "Url",
    "general/branch": "ブランチ",
    "general/cors-proxy": "CORS プロキシ",
    "general/why-cors-proxy": "なぜ CORS プロキシが必要なのですか?",
    "general/today": "今日",
    "general/graph-view": "関連グラフ",
    "general/graph-view-unavailable":
      "関連グラフを読み込めませんでした。ページを再読み込みしてもう一度お試しください。",
    "general/conflicted": "競合",
    "general/change-file-path": "ファイル パスの変更",
    "general/restore-checkout": "復元 (git checkout)",
    "general/download-pull": "ダウンロード (git pull)",
    "general/upload-push": "アップロード (git pull & git push)",
    "general/commit-message": "コミット メッセージ",
    "general/upload-notebook": "ノートブックをアップロードする",
    "general/check-notebook-updates-periodically":
      "ノートブックの更新を定期的に確認する",
    "general/minutes": "分",
    "general/hard-reset": "ハードリセット",
    "general/Desc": "降順",
    "general/Asc": "昇順",
    "general/pin-the-note": "ノートをピン留めする",
    "general/unpin-the-note": "ノートの固定を解除する",
    "general/add-to-quick-access": "クイック アクセスに追加",
    "general/remove-from-quick-access": "クイック アクセスから削除",
    "general/open-a-local-folder": "ローカル フォルダを開く",
    "general/your-browser-doesnt-support-to-open-local-folder":
      "ブラウザがローカル フォルダを開くことをサポートしていません",
    "general/refresh": "更新",
    "general/welcome-back-to-crossnote": "クロスノートへようこそ",
    "general/continue": "続行",
    "general/reference(s)": "参照",
    "general/References": "参照",

    // Error
    "error/authentication-failed": "認証に失敗しました",
    "error/failed-to-upload-notebook":
      "ノートブックをアップロードできませんでした",
    "error/remote-has-no-commits":
      "リモートリポジトリにはまだコミットがありません。",
    "error/failed-to-download-notebook":
      "ノートブックをダウンロードできませんでした ...",
    "error/notebook-already-exists": "ノートブックは既に存在します",
    "error/invalid-git-url-prefix": "無効な git URL プレフィックス",
    "error/please-resolve-conflicts": "最初に競合を解決してください",
    "error/failed-to-change-file-path": "ファイル パスの変更に失敗しました",
    "error/note-moved-retry":
      "ノートは {{path}} に移動しました。移動先で開いてもう一度お試しください。",
    "error/failed-to-print": "ノートを印刷できませんでした",
    "error/failed-to-save-notebook-settings":
      "ノートブックの設定を保存できませんでした",
    "error/failed-to-remove-notebook": "ノートブックを削除できませんでした",
    "error/notebook-cleanup-failed":
      "ノートブックは削除されましたが、ストレージをクリーンアップできませんでした",
    "error/link-outside-notebook": "リンク先がノートブックの外にあります",
    "error/link-inside-note": "リンク先がフォルダではなくノートの中にあります",
    "error/failed-to-save-note": "ノートを保存できませんでした",
    "error/failed-to-create-note": "ノートを作成できませんでした",
    "error/failed-to-delete-note": "ノートを削除できませんでした",
    "error/failed-to-save-note-settings": "ノートの設定を保存できませんでした",
    "error/notebook-sync-conflicts":
      "同期の競合: {{files}}。変更は保持されています。再度アップロードする前にファイルを確認してください。",
    "git/sync-conflicts":
      "同期の競合: {{files}}。競合を解決してから再試行してください。",
    "error/notebook-file-deleted-local": "{{file}}（ローカルで削除）",
    "error/notebook-file-deleted-remote": "{{file}}（リモートで削除）",
    "error/notes-not-saved":
      "{{notes}} を保存できなかったため、実行しませんでした",

    // Success
    "success/notebook-uploaded": "ノートブックがアップロードされます",
    "success/notebook-downloaded": "ノートブックがダウンロードされます",
    "info/notebook-pending-upload":
      "アップロード待ちのローカルコミットがあります。",
    "success/notebook-up-to-date":
      "ダウンロードする新しいコミットはありません。",
    "error/notebook-file-ignored":
      "{{file}} が Git の除外ルールに一致するため、アップロードを中断しました。ルールを変更して再試行してください。",
    "error/notebook-branch-mismatch":
      "同期を一時停止しました。作業コピーとノートブックに設定されたブランチが異なるコミットを指しています。",
    "error/notebook-history-diverged":
      "現在の履歴ではファストフォワードできるか確認できません。両方のブランチを保持しました。",

    // Info
    "info/downloading-notebook": "ノートブックをダウンロード中",

    // Warning
    "warning/front-matter-unreadable":
      "このノートのフロントマターを読み取れません。そのまま残します。",

    // Settings
    "settings/about-this-project": "このプロジェクトについて",
    "settings/issues-and-feature-requests":
      "問題を発見したか、機能要求がありますか？",
    "settings/default-editor-mode": "既定のエディター モード",
    "settings/source-code-line-numbers": "ソースコードモードで行番号を表示",
    "settings/author-name": "著者名",
    "settings/author-email": "著者の電子メール",
    "settings/theme": "テーマ",
    "settings/persistent-storage": "永続ストレージ",
    "settings/persistent-storage/persisted":
      "オン：ブラウザーは空き容量を確保するためにこのサイトのノートを消去しません。",
    "settings/persistent-storage/not-persisted":
      "オフ：空き容量が少なくなると、ブラウザーがこのサイトのノートを消去することがあります。",
    "settings/persistent-storage/unsupported":
      "このブラウザーでは利用できません。",
    "settings/ask-for-persistent-storage": "もう一度申請",

    // ProfileCard
    "profile-card/notes": "ノート",

    // Editor
    "editor/placeholder": "#  こんにちは 😀 コマンドに 「/」 と入力します。",
    "editor/ln": "行",
    "editor/col": "列",
    "editor/split-horizontally": "水平方向に分割",
    "editor/split-vertically": "垂直方向に分割",

    // * EditorToolBar
    "editor/toolbar/insert-header-1": "第1レベルの見出しを挿入",
    "editor/toolbar/insert-header-2": "第2レベルの見出しを挿入",
    "editor/toolbar/insert-header-3": "第3レベルの見出しを挿入",
    "editor/toolbar/insert-header-4": "第4レベルの見出しを挿入",
    "editor/toolbar/insert-header-5": "第5レベルの見出しを挿入",
    "editor/toolbar/insert-header-6": "第6レベルの見出しを挿入",
    "editor/toolbar/insert-blockquote": "参照を挿入",
    "editor/toolbar/insert-unordered-list": "順不同リストを挿入",
    "editor/toolbar/insert-ordered-list": "順序付きリストを挿入",
    "editor/toolbar/insert-table": "テーブルを挿入",
    "editor/toolbar/insert-date-time": "日付と時刻を挿入",
    "editor/toolbar/insert-mermaid": "Mermaid の図を挿入",

    // * NoteControl
    "editor/note-control/source-code": "ソースコード",
    "editor/note-control/preview": "プレビュー",
    "editor/note-control/shareable-link": "共有可能なリンク",
    "editor/note-control/copy-to-clipboard": "ペーストボードにコピー",

    // Utils

    // Widgets
    "widget/crossnote.auth/welcome": "クロスノートへようこそ",
    "widget/crossnote.auth/Or": "または",

    // Dialogs
    "delete-note-dialog/title": "このノートを削除しますか?",
    "delete-note-dialog/subtitle": "この操作を取り消すことはできません。",
    "unsaved-note-dialog/title": "保存せずにこのノートを閉じますか？",
    "unsaved-note-dialog/subtitle":
      "このノートは保存できませんでした。タブを閉じると、最後に保存してから入力した内容は失われます。",
    "unsaved-note-dialog/close-anyway": "それでも閉じる",
    "add-notebook-dialog/disclaimer":
      "すべてのノートブックデータは、ブラウザにローカルに保存されます。ノートブックデータを当社のサーバーにアップロードすることはありません。",
    "edit-image-dialog/title": "画像を編集する",
    "edit-image-dialog/note-changed":
      "ノートが変更されました。このダイアログを閉じて、画像を選び直してください。",
    "edit-image-dialog/image-url": "画像の URL",
    "edit-image-dialog/image-title": "画像のタイトル",
    "edit-image-dialog/image-alt-text": "画像代替テキスト",
    "language-selector-dialog/subtitle": "希望する言語を選択してください",

    // git
    "git/status/ignored": "無視",
    "git/status/unmodified": "未変更",
    "git/status/*modified": "*変更済み",
    "git/status/*deleted": "*削除済み",
    "git/status/*added": "*追加",
    "git/status/absent": "欠落",
    "git/status/modified": "変更済み",
    "git/status/deleted": "削除済み",
    "git/status/added": "追加",
    "git/status/*unmodified": "*未変更",
    "git/status/*absent": "*欠落",
    "git/status/*undeleted": "*削除されませんでした",
    "git/status/*undeletemodified": "*undeletemodified",
    "git/status/": "",

    // graph view
    "graph-view/node": "ノード",
    "graph-view/link": "リンク",

    // Layout (flexlayout-react's own labels)
    "layout/hidden-tabs": "非表示のタブ",
    "layout/resize": "サイズ変更",
    "layout/move-tabs": "? 個のタブを移動",
    "layout/move-tabset": "パネルを移動",
    "layout/error-rendering-component":
      "コンポーネントの描画中にエラーが発生しました",
    "layout/retry": "再試行",
    "git/credentials-storage": "資格情報はこのブラウザーに保存されます。",
    "git/proxy-credentials": "選択したプロキシはこの資格情報を参照できます。",
    "git/replacement-proxy":
      "このプロキシを使用するには {{proxy}} を入力して保存します。",
    "git/change-credentials": "Git 資格情報を変更",
    "git/needs-login": "Git へのサインインが必要です",
    "git/credentials-saved": "Git 資格情報を保存しました",
    "git/credentials-cleared": "Git 資格情報を消去しました",
    "git/cloned": "ノートブックをクローンしました",
    "git/cloned-credentials":
      "ノートブックをクローンし、Git 資格情報を保存しました。",
    "git/clone-failed": "ノートブックのクローンに失敗しました",
    "git/download-auth-failed": "ダウンロード時の認証に失敗しました",
    "git/upload-unchanged": "アップロードする変更はありません",
    "git/upload-confirmed": "ローカルのコミットはすでにリモートにあります",
    "git/downloaded-no-upload":
      "リモートの変更をダウンロードしました。アップロードする変更はありません。",
    "git/upload-download-failed":
      "ダウンロード中にアップロードを中断しました。プッシュは行われていません。",
    "git/upload-prepare-failed":
      "アップロードするローカルの変更を準備できませんでした",
    "git/upload-prepare-failed-after-download":
      "ダウンロードは完了しました。アップロードするローカルの変更を準備できませんでした。",
    "git/upload-push-failed-after-download":
      "ダウンロードは完了しました。プッシュに失敗しました。",
    "git/uploaded-and-downloaded":
      "リモートの変更をダウンロードし、ノートブックをアップロードしました。",
    "git/confirmed-and-downloaded":
      "ローカルのコミットはリモートにあり、後続の変更をダウンロードしました。",
    "git/local-update-failed":
      "{{outcome}}。ローカルのノートブックの更新を完了できませんでした。",
    "git/checkout-complete": "ノートをコミット済みの内容に戻しました",
    "git/checkout-failed": "チェックアウトに失敗しました",
    "git/reset-complete":
      "ノートブックを現在のローカルコミットの状態に戻しました",
    "git/reset-confirm":
      "{{branch}} を {{sha}} にリセットしますか？追跡中のファイルの変更を破棄し、ステージに追加した新規ファイルを削除します。一覧に表示されたファイルやフォルダーのうち、復元を妨げるものも削除されます。",
    "git/confirm-reset": "リセットを確定",
    "error/no-committed-note":
      "このノートにはまだコミット済みの版がありません。",
    "error/reset-target-changed":
      "プレビュー後にノートブックが変更されました。リセットの対象をもう一度確認してください。",
    "git/reset-failed": "ノートブックのリセットに失敗しました",
    "error/restore-persistence":
      "作業ファイルは復元されましたが、ノートブックを保存できませんでした。",
    "git/details": "詳細",
    "git/copy-details": "詳細をコピー",
    "git/details-copied": "詳細をコピーしました",
    "git/copy-failed": "詳細をコピーできませんでした",
    "error/git-credentials-require-https":
      "Git 資格情報を使うにはリポジトリとプロキシの両方で HTTPS が必要です。",
    "error/git-unexpected-target":
      "Git 資格情報は設定済みのリポジトリまたはプロキシにのみ送信できます。",
    "error/git-confirm-proxy":
      "Git 資格情報を使う前に、ノートブックの設定に表示されたプロキシを保存してください。",
  },
} satisfies typeof enUS;
