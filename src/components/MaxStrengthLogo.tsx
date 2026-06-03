import React from 'react';

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
  const boxSize = {
    sm: 'w-6 h-6 text-[11px]',
    md: 'w-8 h-8 text-[12px]',
    lg: 'w-12 h-12 text-[18px]',
    xl: 'w-[72px] h-[72px] text-[32px]',
    '2xl': 'w-[96px] h-[96px] text-[42px]'
  }[size];

  const textSize = {
    sm: 'text-[13px]',
    md: 'text-[16px]',
    lg: 'text-[28px]',
    xl: 'text-[52px]',
    '2xl': 'text-[64px]'
  }[size];

  const fitnessSize = {
    sm: 'text-[8px]',
    md: 'text-[10px]',
    lg: 'text-[16px]',
    xl: 'text-[28px]',
    '2xl': 'text-[36px]'
  }[size];

  const spacing = {
    sm: 'gap-[2px]',
    md: 'gap-[4px]',
    lg: 'gap-[6px]',
    xl: 'gap-[10px]',
    '2xl': 'gap-[12px]'
  }[size];

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      {/* Three Squares */}
      <div className={`flex ${spacing}`}>
        <div className={`${boxSize} bg-[#005187] flex items-center justify-center font-medium text-white rounded-[2px]`}>M</div>
        <div className={`${boxSize} bg-[#eb6e21] flex items-center justify-center text-white rounded-[2px]`}>
          <svg width="0.65em" height="0.65em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" strokeLinejoin="miter">
            <polyline points="4 21 12 4 20 21" />
          </svg>
        </div>
        <div className={`${boxSize} bg-[#667279] flex items-center justify-center font-medium text-white rounded-[2px]`}>X</div>
      </div>
      
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
