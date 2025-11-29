(function() {
    window.FX_REGISTRY.register({
        id: "fx_gloss_sweep",
        name: "亮面掃過",
        enable: false,
        params: [
            { id: "speed", label: "掃描速度(秒)", type: "range", min: 0.3, max: 5, step: 0.1, value: 1.2 }
        ],
        generateCSS: function(values, globalVars) {
            const anim = `gloss_${this.id}`;
            return `
                #goalDiv .progress .progress-bar::before {
                    content: "";
                    position: absolute;
                    inset: 0;
                    background: linear-gradient(
                        60deg,
                        transparent 0%,
                        #ffffff55 40%,
                        transparent 100%
                    );
                    animation: ${anim} ${values.speed}s infinite linear !important;
                }
                @keyframes ${anim} {
                    from { transform: translateX(-100%); }
                    to   { transform: translateX(100%); }
                }
            `;
        }
    });
})();
