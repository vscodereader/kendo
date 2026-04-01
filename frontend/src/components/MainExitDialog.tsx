type MainExitDialogProps = {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

function MainExitDialog({ open, onConfirm, onCancel }: MainExitDialogProps) {
  if (!open) return null;

  return (
    <div className="main-exit-backdrop" onClick={onCancel}>
      <div className="main-exit-dialog" onClick={(event) => event.stopPropagation()}>
        <h3>종료하시겠습니까?</h3>
        <p>앱을 종료하려면 예를 눌러주세요.</p>

        <div className="main-exit-actions">
          <button type="button" className="main-exit-btn main-exit-btn--ghost" onClick={onCancel}>
            아니오
          </button>

          <button type="button" className="main-exit-btn main-exit-btn--primary" onClick={onConfirm}>
            예
          </button>
        </div>
      </div>
    </div>
  );
}

export default MainExitDialog;