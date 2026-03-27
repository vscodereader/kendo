import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactQuill, { Quill } from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

const SizeClass = Quill.import('attributors/class/size');
SizeClass.whitelist = ['small', 'normal', 'large', 'huge'];
Quill.register(SizeClass, true);

const FontClass = Quill.import('attributors/class/font');
FontClass.whitelist = ['sans', 'serif', 'monospace'];
Quill.register(FontClass, true);

type Props = {
  value: string;
  onChange: (next: string) => void;
};

type SavedRange = {
  index: number;
  length: number;
};

function RichBoardEditor({ value, onChange }: Props) {
  const quillRef = useRef<ReactQuill | null>(null);
  const savedRangeRef = useRef<SavedRange | null>(null);

  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);

  const [mapModalOpen, setMapModalOpen] = useState(false);
  const [mapPlace, setMapPlace] = useState('');
  const [mapAddress, setMapAddress] = useState('');
  const [mapLink, setMapLink] = useState('');

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

  const modules = useMemo(
    () => ({
      toolbar: {
        container: '#board-editor-toolbar',
        handlers: {
          image: () => setImageModalOpen(true),
          naverMap: () => setMapModalOpen(true),
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
    'video'
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

    editor.insertEmbed(index, 'image', imageDataUrl, 'user');
    editor.setSelection(index + 1, 0, 'user');

    setImageModalOpen(false);
    setImageDataUrl(null);
  };

  const insertMap = () => {
    if (!mapAddress.trim()) return;

    const editor = quillRef.current?.getEditor();
    if (!editor) return;

    const range = editor.getSelection(true);
    const index = range?.index ?? editor.getLength();

    const token = `[[NAVER_MAP::${encodeURIComponent(mapPlace.trim())}::${encodeURIComponent(
      mapAddress.trim()
    )}::${encodeURIComponent(mapLink.trim())}]]`;

    editor.insertText(index, `\n${token}\n`, 'user');
    editor.setSelection(index + token.length + 2, 0, 'user');

    setMapModalOpen(false);
    setMapPlace('');
    setMapAddress('');
    setMapLink('');
  };

  return (
    <div className="rich-board-editor">
      <div id="board-editor-toolbar">
        <select className="ql-font" defaultValue="sans">
          <option value="sans">기본</option>
          <option value="serif">명조</option>
          <option value="monospace">고정폭</option>
        </select>

        <select className="ql-size" defaultValue="normal">
          <option value="small">작게</option>
          <option value="normal">보통</option>
          <option value="large">크게</option>
          <option value="huge">아주 크게</option>
        </select>

        <select className="ql-header" defaultValue="">
          <option value="">본문</option>
          <option value="1">제목 1</option>
          <option value="2">제목 2</option>
          <option value="3">제목 3</option>
        </select>

        <button className="ql-bold" />
        <button className="ql-italic" />
        <button className="ql-underline" />
        <button className="ql-strike" />

        <select className="ql-color" />
        <select className="ql-background" />

        <button className="ql-list" value="ordered" />
        <button className="ql-list" value="bullet" />
        <select className="ql-align" />

        <button className="ql-blockquote" />
        <button className="ql-link" />
        <button className="ql-image" />
        <button className="ql-video" />
        <button className="ql-clean" />

        <button className="ql-naverMap" type="button" onMouseDown={(event) => event.preventDefault()}>
          지도
        </button>
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

      {mapModalOpen ? (
        <div className="modal-backdrop">
          <div className="image-insert-modal">
            <div className="image-insert-modal__title">지도 삽입</div>

            <label className="form-field">
              <span>장소명</span>
              <input value={mapPlace} onChange={(event) => setMapPlace(event.target.value)} placeholder="예: 문정검도관" />
            </label>

            <label className="form-field">
              <span>주소</span>
              <input
                value={mapAddress}
                onChange={(event) => setMapAddress(event.target.value)}
                placeholder="예: 서울 송파구 문정로 11 지하 1층 문정검도관"
              />
            </label>

            <label className="form-field">
              <span>네이버 지도 링크</span>
              <input
                value={mapLink}
                onChange={(event) => setMapLink(event.target.value)}
                placeholder="예: https://map.naver.com/..."
              />
            </label>

            <div className="modal-actions">
              <button type="button" className="primary-btn" onClick={insertMap} disabled={!mapAddress.trim()}>
                삽입
              </button>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => {
                  setMapModalOpen(false);
                  setMapPlace('');
                  setMapAddress('');
                  setMapLink('');
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
}

export default RichBoardEditor;