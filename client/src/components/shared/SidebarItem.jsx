export default function SidebarItem({ icon: Icon, label, active, onClick, activeColor }) {
  const bgColor = activeColor || 'var(--system-blue)';
  return (
    <button onClick={onClick} className={`
      w-full flex items-center gap-3 px-4 py-3 text-left transition-all rounded-xl
      ${active
        ? 'text-white shadow-sm'
        : 'text-[var(--label-secondary)] hover:bg-[var(--fill-tertiary)]'
      }
    `}
    style={active ? { backgroundColor: bgColor } : undefined}
    >
      <Icon className="w-5 h-5 shrink-0" />
      <span className="text-[14px] font-medium">{label}</span>
    </button>
  );
}
