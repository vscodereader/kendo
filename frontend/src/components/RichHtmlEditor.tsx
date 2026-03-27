import { useMemo, useRef, useState } from 'react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

type Props = {
  value: string;
  onChange: (next: string) => void;
};

function RichHtmlEditor({ value, onChange }: Props) {
  const quillRef = useRef<ReactQuill | null>(null);
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);

  const modules = useMemo(
    () => ({
      toolbar: {
        container: [
          [{ font: [] }, { size: ['small', false, 'large', 'huge'] }],
          [{ header: [1, 2, 3, false] }],
          ['bold', 'italic', 'underline', 'strike'],
          [{ color: [] }, { background: [] }],
          [{ list: 'ordered' }, { list: 'bullet' }],
          [{ align: [] }],
          ['blockquote', 'link', 'image', 'video'],
          ['clean']
        ],
        handlers: {
          image: () => setImageModalOpen(true)
        }
      },
      history: {
        delay: 300,
        maxStack: 100,
        userOnly: true
      }
    }),
    []
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
    'bullet',
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

  return (
    <div className="rich-editor-wrap">
      <ReactQuill ref={quillRef} theme="snow" value={value} onChange={onChange} modules={modules} formats={formats} />

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
}

export default RichHtmlEditor;