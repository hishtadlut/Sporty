export const getBodySVG = () => {
    return `
    <svg id="body-heatmap" viewBox="0 0 200 400" xmlns="http://www.w3.org/2000/svg" style="max-height: 100%; width: auto;">
        <!-- Body outline -->
        <path d="M 100, 20 C 110,20 120,30 120,45 C 120,60 110,70 100,70 C 90,70 80,60 80,45 C 80,30 90,20 100,20 Z" fill="#333" />

        <!-- Chest -->
        <path id="muscle-Chest" d="M 85, 75 L 115, 75 L 120, 110 L 80, 110 Z" fill="#444" stroke="#222" stroke-width="2"/>

        <!-- Shoulders -->
        <path id="muscle-Shoulders" d="M 65, 70 L 80, 70 L 80, 100 L 60, 100 Z M 120, 70 L 135, 70 L 140, 100 L 120, 100 Z" fill="#444" stroke="#222" stroke-width="2"/>

        <!-- Arms -->
        <path id="muscle-Arms" d="M 60, 105 L 75, 105 L 70, 170 L 55, 170 Z M 125, 105 L 140, 105 L 145, 170 L 130, 170 Z" fill="#444" stroke="#222" stroke-width="2"/>

        <!-- Back -->
        <path id="muscle-Back" d="M 75, 115 L 85, 115 L 85, 180 L 70, 180 Z M 115, 115 L 125, 115 L 130, 180 L 115, 180 Z" fill="#444" stroke="#222" stroke-width="2"/>

        <!-- Legs -->
        <path id="muscle-Legs" d="M 85, 185 L 115, 185 L 120, 270 L 115, 360 L 95, 360 L 95, 270 L 105, 270 L 105, 360 L 85, 360 L 80, 270 Z" fill="#444" stroke="#222" stroke-width="2"/>
    </svg>
    `;
};
