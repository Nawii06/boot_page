export function ConnectionGraphic() {
  return <div className="connection-graphic" aria-hidden="true"><div className="graphic-topline"><span>CONNECT YOUR POSSIBILITIES</span><span>AI</span></div>
    <svg className="connection-svg" viewBox="0 0 500 330" fill="none">
      <defs><linearGradient id="node-gradient" x1="175" y1="80" x2="320" y2="240" gradientUnits="userSpaceOnUse"><stop stopColor="#6DE0D4" /><stop offset="1" stopColor="#38B2AC" /></linearGradient></defs>
      <g stroke="#96C3C7" strokeOpacity=".38"><path d="M249 161 95 80 80 250 249 161 395 61 429 239 249 161 160 297 80 250M95 80 204 34 249 161 366 298 429 239M204 34 395 61M160 297 366 298" /><path d="M95 80 429 239M80 250 395 61" strokeDasharray="3 7" /></g>
      <circle cx="249" cy="161" r="99" stroke="#86CDC8" strokeOpacity=".14" /><circle cx="249" cy="161" r="78" stroke="#86CDC8" strokeOpacity=".23" />
      <circle cx="249" cy="161" r="58" fill="url(#node-gradient)" /><text x="249" y="177" textAnchor="middle" fill="#17324D" fontFamily="Arial, sans-serif" fontSize="45" fontWeight="600">AI</text>
      {[[95,80],[80,250],[204,34],[395,61],[429,239],[160,297],[366,298]].map(([cx,cy],i) => <g key={i}><circle cx={cx} cy={cy} r={i % 2 ? 9 : 12} fill={i % 2 ? '#244F65' : '#C3E7E3'} /><circle cx={cx} cy={cy} r={i % 2 ? 17 : 21} stroke="#96C3C7" strokeOpacity=".2" /></g>)}
    </svg>
    <div className="graphic-bottomline"><span>전공</span><span className="graphic-line" /><span>연결</span><span className="graphic-line" /><span>가능성</span></div>
  </div>;
}

