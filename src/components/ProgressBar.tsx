interface Props {
  percent: number;
}

export default function ProgressBar({ percent }: Props) {
  return (
    <div className="progress-wrap">
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
      <div className="progress-label" style={{ width: `${percent}%`, textAlign: "right" }}>
        {percent}%
      </div>
    </div>
  );
}
