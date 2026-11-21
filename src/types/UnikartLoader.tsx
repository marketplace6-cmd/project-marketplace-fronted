import React from 'react';

export interface UnikartLoaderProps {
  message?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  inline?: boolean;
}

const sizeClasses = {
  xs: 'h-6 w-auto',
  sm: 'h-9 w-auto',
  md: 'h-14 w-auto',
  lg: 'h-20 w-auto',
  xl: 'h-28 w-auto',
};

export function UnikartLoader({
  message,
  size = 'md',
  className = '',
  inline = false,
}: UnikartLoaderProps) {
  const imgClass = sizeClasses[size] || sizeClasses.md;

  if (inline) {
    return (
      <span className={`inline-flex items-center gap-2 ${className}`}>
        <img
          src="/unikart-loader.gif"
          alt="Loading..."
          className={`${imgClass} object-contain`}
          style={{
            mixBlendMode: 'multiply',
            backgroundColor: 'transparent',
          }}
        />
        {message && <span className="text-xs font-semibold text-slate-600">{message}</span>}
      </span>
    );
  }

  return (
    <div className={`flex flex-col items-center justify-center py-6 px-4 text-center ${className}`}>
      <img
        src="/unikart-loader.gif"
        alt="Loading..."
        className={`${imgClass} object-contain`}
        style={{
          mixBlendMode: 'multiply',
          backgroundColor: 'transparent',
        }}
      />
      {message && (
        <p className="mt-3 text-xs sm:text-sm font-semibold text-slate-600 tracking-wide animate-pulse">
          {message}
        </p>
      )}
    </div>
  );
}

export default UnikartLoader;

