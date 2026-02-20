export default function SidebarItem({ icon: Icon, label, active, onClick, activeColor }) {
  const accentColor = activeColor || 'var(--chart-primary)';
  return (
    <button onClick={onClick} className={`
      w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all rounded-xl relative
      ${active
        ? 'font-semibold'
        : 'text-[var(--label-secondary)] hover:bg-[var(--fill-tertiary)]'
      }
    `}
    style={active ? {
      backgroundColor: `color-mix(in srgb, ${accentColor} 12%, transparent)`,
      color: accentColor,
    } : undefined}
    >
      {/* Active indicator bar */}
      {active && (
        <span
          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
          style={{ backgroundColor: accentColor }}
        />
      )}
      <Icon className="w-5 h-5 shrink-0" />
      <span className="text-[15px]">{label}</span>
    </button>
  );
}
