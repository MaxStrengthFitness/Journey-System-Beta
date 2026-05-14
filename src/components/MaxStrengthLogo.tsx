import React from 'react';

interface MaxStrengthLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  className?: string;
  theme?: 'light' | 'dark';
}

export const MaxStrengthLogo: React.FC<MaxStrengthLogoProps> = ({ 
  size = 'md', 
  showText = true,
  className = '',
  theme = 'light'
}) => {
  const boxSize = {
    sm: 'w-6 h-6 text-[10px]',
    md: 'w-8 h-8 text-[12px]',
    lg: 'w-12 h-12 text-[18px]',
    xl: 'w-20 h-20 text-[32px]'
  }[size];

  const textSize = {
    sm: 'text-[10px]',
    md: 'text-[14px]',
    lg: 'text-[24px]',
    xl: 'text-[42px]'
  }[size];

  const fitnessSize = {
    sm: 'text-[12px]',
    md: 'text-[18px]',
    lg: 'text-[32px]',
    xl: 'text-[56px]'
  }[size];

  const spacing = {
    sm: 'gap-0.5',
    md: 'gap-1',
    lg: 'gap-2',
    xl: 'gap-4'
  }[size];

  return (
    <div className={`flex flex-col items-center ${className}`}>
      {/* Three Squares */}
      <div className={`flex ${spacing}`}>
        <div className={`${boxSize} bg-[#004D8C] flex items-center justify-center font-medium text-white rounded-[2px]`}>M</div>
        <div className={`${boxSize} bg-[#F06C22] flex items-center justify-center font-medium text-white rounded-[2px] leading-none pt-1`}>^</div>
        <div className={`${boxSize} bg-[#636E76] flex items-center justify-center font-medium text-white rounded-[2px]`}>X</div>
      </div>
      
      {showText && (
        <div className="flex flex-col items-center mt-2 leading-tight">
          <span className={`${textSize} font-black ${theme === 'dark' ? 'text-white' : 'text-[#636E76]'} uppercase tracking-[0.2em] drop-shadow-sm`}>Strength</span>
          <span className={`${fitnessSize} font-bold ${theme === 'dark' ? 'text-white/80' : 'text-[#004D8C]'} uppercase tracking-[0.3em] -mt-1 drop-shadow-sm`}>Fitness</span>
        </div>
      )}
    </div>
  );
};
