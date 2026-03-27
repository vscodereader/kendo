import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from 'react';
import ReactQuill, { Quill } from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

const SizeClass = Quill.import('attributors/class/size');
SizeClass.whitelist = ['small', 'normal', 'large', 'huge'];
Quill.register(SizeClass, true);

const FontClass = Quill.import('attributors/class/font');
FontClass.whitelist = ['sans', 'serif', 'monospace'];
Quill.register(FontClass, true);

const BlockEmbed = Quill.import('blots/block/embed');

export type MoneySnapshotEmbedPayload = {
  title: string;
  entries: Array<{
    category: string | null;
    item: string | null;
    note: string | null;
    income: number | null;
    expense: number | null;
    remainingFee: number | null;
    leftFee: number | null;
  }>;
};

class MoneyTableBlot extends BlockEmbed {
  static blotName = 'moneytable';
  static tagName = 'div';
  static className = 'notice-money-placeholder';

  static create(value: MoneySnapshotEmbedPayload) {
    const node = super.create() as HTMLElement;
    const encoded = encodeURIComponent(JSON.stringify(value));
    node.setAttribute('data-payload', encoded);
    node.setAttribute('contenteditable', 'false');
    node.textContent = `[${value.title} 첨부]`;
    return node;
  }

  static value(node: HTMLElement) {
    return {
      payload: node.getAttribute('data-payload') ?? ''
    };
  }
}

Quill.register(MoneyTableBlot, true);

export type NoticeEditorHandle = {
  insertTextAtCursor: (text: string) => void;
  insertHtmlAtCursor: (html: string) => void;
  insertMoneyTableAtCursor: (payload: MoneySnapshotEmbedPayload) => void;
};

type Props = {
  value: string;
  onChange: (next: string) => void;
  showMoneyImportButton?: boolean;
  onOpenMoneyImport?: () => void;
};

type SavedRange = {
  index: number;
  length: number;
};

function applyToolbarTitles(root: HTMLElement | null) {
  if (!root) return;

  const setTitle = (selector: string, title: string) => {
    root.querySelectorAll<HTMLElement>(selector).forEach((element) => {
      element.setAttribute('title', title);
      element.setAttribute('aria-label', title);
    });
  };

  setTitle('.ql-font', '글꼴');
  setTitle('.ql-size', '글자 크기');
  setTitle('.ql-header', '제목 크기');
  setTitle('.ql-bold', '굵게');
  setTitle('.ql-italic', '기울임');
  setTitle('.ql-underline', '밑줄');
  setTitle('.ql-strike', '취소선');
  setTitle('.ql-color', '글자 색');
  setTitle('.ql-background', '배경 색');
  setTitle('.ql-list[value="ordered"]', '번호 목록');
  setTitle('.ql-list[value="bullet"]', '글머리 기호');
  setTitle('.ql-align', '정렬');
  setTitle('.ql-blockquote', '인용문');
  setTitle('.ql-link', '링크');
  setTitle('.ql-image', '이미지');
  setTitle('.ql-video', '영상');
  setTitle('.ql-clean', '서식 지우기');
}

const NoticeEditor = forwardRef<NoticeEditorHandle, Props>(function NoticeEditor(
  { value, onChange, showMoneyImportButton = false, onOpenMoneyImport },
  ref
) {
  const quillRef = useRef<ReactQuill | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const savedRangeRef = useRef<SavedRange | null>(null);

  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);

  useEffect(() => {
    applyToolbarTitles(toolbarRef.current);
  }, []);

  useEffect(() => {
    const editor = quillRef.current?.getEditor();
    if (!editor) return;

    const handleSelectionChange = (range: SavedRange | null) => {
      if (range) {
        savedRangeRef.current = {
          index: range.index,
          length: range.length
        };
      }
    };

    editor.on('selection-change', handleSelectionChange);
    return () => {
      editor.off('selection-change', handleSelectionChange);
    };
  }, []);

  const withStoredSelection = useCallback(
    (callback: (editor: any, range: SavedRange) => void) => {
      const editor = quillRef.current?.getEditor();
      if (!editor) return;

      const liveRange = editor.getSelection();
      const range =
        liveRange ??
        savedRangeRef.current ?? {
          index: editor.getLength(),
          length: 0
        };

      savedRangeRef.current = {
        index: range.index,
        length: range.length
      };

      editor.focus();
      editor.setSelection(range.index, range.length, 'silent');
      callback(editor, range);

      const nextRange = editor.getSelection();
      if (nextRange) {
        savedRangeRef.current = {
          index: nextRange.index,
          length: nextRange.length
        };
      }
    },
    []
  );

  const applyInlineFormat = useCallback(
    (name: string, value: unknown) => {
      withStoredSelection((editor) => {
        editor.format(name, value, 'user');
      });
    },
    [withStoredSelection]
  );

  const applyLineFormat = useCallback(
    (name: string, value: unknown) => {
      withStoredSelection((editor, range) => {
        editor.formatLine(range.index, Math.max(range.length, 1), name, value, 'user');
      });
    },
    [withStoredSelection]
  );

  useImperativeHandle(ref, () => ({
    insertTextAtCursor(text: string) {
      const editor = quillRef.current?.getEditor();
      if (!editor) return;

      const range = editor.getSelection(true);
      const index = range?.index ?? editor.getLength();

      editor.insertText(index, text, 'user');
      editor.setSelection(index + text.length, 0, 'user');
    },
    insertHtmlAtCursor(html: string) {
      const editor = quillRef.current?.getEditor();
      if (!editor) return;

      const range = editor.getSelection(true);
      const index = range?.index ?? editor.getLength();

      editor.clipboard.dangerouslyPasteHTML(index, html, 'user');
      editor.setSelection(index + 1, 0, 'user');
    },
    insertMoneyTableAtCursor(payload: MoneySnapshotEmbedPayload) {
      const editor = quillRef.current?.getEditor();
      if (!editor) return;

      const range = editor.getSelection(true);
      const index = range?.index ?? editor.getLength();

      editor.insertEmbed(index, 'moneytable', payload, 'user');
      editor.insertText(index + 1, '\n', 'user');
      editor.setSelection(index + 2, 0, 'user');
    }
  }));

  const modules = useMemo(
    () => ({
      toolbar: {
        container: '#notice-editor-toolbar',
        handlers: {
          image: () => setImageModalOpen(true),
          font: (value: string) => applyInlineFormat('font', value || false),
          size: (value: string) => applyInlineFormat('size', value || false),
          header: (value: string) => applyLineFormat('header', value ? Number(value) : false),
          color: (value: string) => applyInlineFormat('color', value || false),
          background: (value: string) => applyInlineFormat('background', value || false),
          align: (value: string) => applyLineFormat('align', value || false)
        }
      },
      history: {
        delay: 300,
        maxStack: 100,
        userOnly: true
      },
      keyboard: {
        bindings: {
          'list autofill': false
        }
      }
    }),
    [applyInlineFormat, applyLineFormat]
  );

  const formats = [
    'font',
    'size',
    'header',
    'bold',
    'italic',
    'underline',
    'strike',
    'color',
    'background',
    'list',
    'align',
    'blockquote',
    'link',
    'image',
    'video',
    'moneytable'
  ];

  const handlePickImage = (file?: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImageDataUrl(String(reader.result ?? ''));
    };
    reader.readAsDataURL(file);
  };

  const insertImage = () => {
    if (!imageDataUrl) return;
    const editor = quillRef.current?.getEditor();
    if (!editor) return;

    const range = editor.getSelection(true);
    const index = range?.index ?? editor.getLength();
    const safeSrc = imageDataUrl.replace(/"/g, '&quot;');

    const html = `
      <p>
        <span class="notice-inline-image" contenteditable="false">
          <img src="${safeSrc}" alt="첨부 이미지" />
        </span>
      </p>
      <p><br></p>
    `.trim();

    editor.clipboard.dangerouslyPasteHTML(index, html, 'user');
    editor.setSelection(index + 2, 0, 'user');

    setImageModalOpen(false);
    setImageDataUrl(null);
  };

  return (
    <div className="notice-editor">
      <div id="notice-editor-toolbar" ref={toolbarRef}>
        <select className="ql-font" defaultValue="sans" title="글꼴">
          <option value="sans">기본</option>
          <option value="serif">명조</option>
          <option value="monospace">고정폭</option>
        </select>

        <select className="ql-size" defaultValue="normal" title="글자 크기">
          <option value="small">작게</option>
          <option value="normal">보통</option>
          <option value="large">크게</option>
          <option value="huge">아주 크게</option>
        </select>

        <select className="ql-header" defaultValue="" title="제목 크기">
          <option value="">본문</option>
          <option value="1">제목 1</option>
          <option value="2">제목 2</option>
          <option value="3">제목 3</option>
        </select>

        <button className="ql-bold" title="굵게" />
        <button className="ql-italic" title="기울임" />
        <button className="ql-underline" title="밑줄" />
        <button className="ql-strike" title="취소선" />

        <select className="ql-color" title="글자 색" />
        <select className="ql-background" title="배경 색" />

        <button className="ql-list" value="ordered" title="번호 목록" />
        <button className="ql-list" value="bullet" title="글머리 기호" />
        <select className="ql-align" title="정렬" />

        <button className="ql-blockquote" title="인용문" />
        <button className="ql-link" title="링크" />
        <button className="ql-image" title="이미지" />
        <button className="ql-video" title="영상" />
        <button className="ql-clean" title="서식 지우기" />

        {showMoneyImportButton ? (
          <button
            type="button"
            className="notice-toolbar-icon-btn"
            title="예산표"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onOpenMoneyImport}
          >
            📊
          </button>
        ) : null}
      </div>

      <ReactQuill
        ref={quillRef}
        theme="snow"
        value={value}
        onChange={onChange}
        modules={modules}
        formats={formats}
      />

      {imageModalOpen ? (
        <div className="modal-backdrop">
          <div className="image-insert-modal">
            <div className="image-insert-modal__title">이미지 업로드 하기</div>

            <label className="image-dropzone">
              <input
                type="file"
                accept="image/*"
                onChange={(event) => handlePickImage(event.target.files?.[0] ?? null)}
                hidden
              />
              <span>+ 이미지 추가</span>
            </label>

            {imageDataUrl ? <img src={imageDataUrl} alt="미리보기" className="image-preview" /> : null}

            <div className="modal-actions">
              <button type="button" className="primary-btn" onClick={insertImage} disabled={!imageDataUrl}>
                적용
              </button>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => {
                  setImageModalOpen(false);
                  setImageDataUrl(null);
                }}
              >
                취소
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
});

export default NoticeEditor;