type Props = {
  className?: string;
};

export default function CharlalLogo({ className = '' }: Props) {
  const classes = ['charlal-logo', className].filter(Boolean).join(' ');

  return (
    <span className={classes}>
      <span className="charlal-logo-mark" aria-hidden="true">
        <svg viewBox="0 0 40 40" focusable="false">
          <circle cx="20" cy="20" r="16" />
          <path d="M26.7 12.9A10 10 0 1 0 26.7 27" />
        </svg>
      </span>
      <span className="charlal-logo-wordmark">Charlal</span>
    </span>
  );
}
