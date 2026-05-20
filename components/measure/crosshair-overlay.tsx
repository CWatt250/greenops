'use client';

export function CrosshairOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="absolute inset-0 pointer-events-none z-20 flex items-center justify-center md:hidden">
      <div className="relative flex items-center justify-center">
        <div className="absolute w-8 h-8 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]" />
        <div
          className="w-2.5 h-2.5 rounded-full shadow-[0_0_0_1.5px_#fff]"
          style={{ backgroundColor: '#F15A24' }}
        />
        <div className="absolute w-12 h-px bg-white/80" />
        <div className="absolute h-12 w-px bg-white/80" />
      </div>
    </div>
  );
}
