interface ComponentIconProps {
  icon: string;
  alt: string;
  className?: string;
  imgClassName?: string;
}

function isImageIcon(icon: string): boolean {
  return /^(\/|https?:|data:)|\.(png|svg|jpe?g|webp)(\?.*)?$/i.test(icon);
}

export function ComponentIcon({ icon, alt, className, imgClassName }: ComponentIconProps) {
  if (isImageIcon(icon)) {
    const imageClassName = `${imgClassName ?? 'h-full w-full object-contain p-[8%]'} block [filter:drop-shadow(0_0_6px_rgba(255,255,255,0.08))]`;
    return (
      <span className={`${className ?? ''} overflow-visible`} aria-hidden="true">
        <img src={icon} alt={alt} className={imageClassName} draggable={false} />
      </span>
    );
  }

  return (
    <span className={className} aria-label={alt} role="img">
      {icon}
    </span>
  );
}
