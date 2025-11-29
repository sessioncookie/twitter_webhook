(function() {
    window.FX_REGISTRY.register({
        id: "fx_rainbow_pulse",
        name: "彩虹流動",
        enable: false,
        params: [
            { id: "speed", label: "流動週期(秒)", type: "range", min: 0.5, max: 10, step: 0.1, value: 3 }
        ],
        generateCSS: function(values, globalVars) {
            const anim = `rainbow_${this.id}`;
            
            // 使用 filter: hue-rotate 來旋轉色相
            // 0deg -> 360deg 代表在色環上轉一圈，剛好回到原點，達成無縫循環
            return `
                #goalDiv .progress .progress-bar {
                    animation: ${anim} ${values.speed}s linear infinite !important;
                }

                @keyframes ${anim} {
                    0%   { filter: hue-rotate(0deg); }
                    100% { filter: hue-rotate(360deg); }
                }
            `;
        }
    });
})();