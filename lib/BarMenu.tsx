import * as React from 'react';

// A control-bar button that opens a popup above it. Closes on outside click.
export function BarMenu(props: {
  title: string;
  className?: string;
  buttonClassName?: string;
  buttonContent?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) {
      return;
    }
    const onMouseDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  return (
    <div ref={ref} className={props.className ? `bar-menu ${props.className}` : 'bar-menu'}>
      {open && <div className="bar-menu-popup">{props.children}</div>}
      <button
        className={props.buttonClassName ?? 'lk-button'}
        title={props.title}
        aria-label={props.title}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {props.buttonContent}
      </button>
    </div>
  );
}
