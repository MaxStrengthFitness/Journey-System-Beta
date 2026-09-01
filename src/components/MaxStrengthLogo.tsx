import React from 'react';
import maxStrengthLogo from '../assets/images/max-strength-logo.svg';

/** Intrinsic dimensions of the source mark — used to lock the aspect ratio (3.193:1). */
const LOGO_INTRINSIC_WIDTH = 1357;
const LOGO_INTRINSIC_HEIGHT = 425;

interface MaxStrengthLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  showText?: boolean;
  className?: string;
  theme?: 'light' | 'dark';
  showSlogan?: boolean;
}

export const MaxStrengthLogo: React.FC<MaxStrengthLogoProps> = ({ 
  size = 'md', 
  showText = true,
  className = '',
  theme = 'light',
  showSlogan = false
}) => {
  // Height-driven sizing: width follows via `w-auto`, so the mark can never stretch.
  // Smaller step on mobile, full size from the `sm` breakpoint up.
  const markSize = {
    sm: 'h-5 sm:h-6',
    md: 'h-7 sm:h-8',
    lg: 'h-10 sm:h-12',
    xl: 'h-14 sm:h-[72px]',
    '2xl': 'h-[72px] sm:h-24'
  }[size];

  const textSize = {
    sm: 'text-[13px]',
    md: 'text-[16px]',
    lg: 'text-[24px] sm:text-[28px]',
    xl: 'text-[40px] sm:text-[52px]',
    '2xl': 'text-[48px] sm:text-[64px]'
  }[size];

  const fitnessSize = {
    sm: 'text-[8px]',
    md: 'text-[10px]',
    lg: 'text-[14px] sm:text-[16px]',
    xl: 'text-[22px] sm:text-[28px]',
    '2xl': 'text-[27px] sm:text-[36px]'
  }[size];

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <img
        src={maxStrengthLogo}
        alt="MAX Strength Fitness"
        width={LOGO_INTRINSIC_WIDTH}
        height={LOGO_INTRINSIC_HEIGHT}
        decoding="async"
        draggable={false}
        className={`${markSize} w-auto max-w-full object-contain select-none`}
      />

      {showText && (
        <div className="flex flex-col items-center mt-3 leading-tight w-full">
          <span className={`${textSize} font-black ${theme === 'dark' ? 'text-white' : 'text-[#667279]'} uppercase tracking-[0.2em] font-sans drop-shadow-sm`}>Strength</span>
          <span className={`${fitnessSize} font-bold ${theme === 'dark' ? 'text-white/80' : 'text-[#005187]'} uppercase tracking-[0.6em] ml-[0.6em] mt-1 drop-shadow-sm`}>Fitness</span>
          
          {showSlogan && (
            <div className={`mt-3 font-medium flex items-center justify-center tracking-normal ${theme === 'dark' ? 'text-white/70' : 'text-[#667279]'} text-xs sm:text-sm whitespace-nowrap`}>
              twenty minutes <span className="text-[#eb6e21] mx-1 md:mx-2 font-bold">+</span> twice a week <span className="text-[#eb6e21] mx-1 md:mx-2 font-bold">=</span> transformation
            </div>
          )}
        </div>
      )}
    </div>
  );
};
