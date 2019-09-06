export function draw_circle(context, position, size) {
    let hsize = size/2;

    context.beginPath();
    context.arc(position[0], position[1], hsize, 0, 2 * Math.PI);
    context.closePath();

    context.stroke();
    context.fill();
}

export function draw_cross(context, position, size) {
    let hsize = size/2;

    context.beginPath();
    context.moveTo(position[0] - hsize, position[1] - hsize);
    context.lineTo(position[0] + hsize, position[1] + hsize);
    context.closePath();

    context.stroke();

    context.beginPath();
    context.moveTo(position[0] - hsize, position[1] + hsize);
    context.lineTo(position[0] + hsize, position[1] - hsize);
    context.closePath();

    context.stroke();
}

export function draw_square(context, position, size) {
    let hsize = size/2;

    context.beginPath();
    context.moveTo(position[0] - hsize, position[1] - hsize);
    context.lineTo(position[0] - hsize, position[1] + hsize);
    context.lineTo(position[0] + hsize, position[1] + hsize);
    context.lineTo(position[0] + hsize, position[1] - hsize);
    context.lineTo(position[0] - hsize, position[1] - hsize);
    context.closePath();

    context.stroke();
    context.fill();
}

export function draw_dot(context, position, size) {
    draw_circle(context, position, size/5);
}

/*
// Start up Aladin Lite
var aladin = A.aladin('#aladin-lite-div', {target: '12 25 41.512 +12 48 47.2', fov: 0.8});

// define custom draw function
var drawFunction = function(source, canvasCtx, viewParams) {
    canvasCtx.beginPath();
    canvasCtx.arc(source.x, source.y, source.data['size'] * 2, 0, 2 * Math.PI, false);
    canvasCtx.closePath();
    canvasCtx.strokeStyle = '#c38';
    canvasCtx.lineWidth = 3;
    canvasCtx.globalAlpha = 0.7,
    canvasCtx.stroke();
    var fov = Math.max(viewParams['fov'][0], viewParams['fov'][1]);

    // object name is displayed only if fov<10°
    if (fov>10) {
        return;
    }

    canvasCtx.globalAlpha = 0.9;
    canvasCtx.globalAlpha = 1;

    var xShift = 20;

    canvasCtx.font = '15px Arial'
    canvasCtx.fillStyle = '#eee';
    canvasCtx.fillText(source.data['name'], source.x + xShift, source.y -4);

    // object type is displayed only if fov<2°
    if (fov>2) {
        return;
    }
    canvasCtx.font = '12px Arial'
    canvasCtx.fillStyle = '#abc';
    canvasCtx.fillText(source.data['otype'], source.x + 2 + xShift, source.y + 10);
};

// create sources objects
var M87 = A.source(187.7059308, 12.3911233, {name: 'M 87', size: 4.5, otype: 'LINER AGN'});
var M49 = A.source(187.444992, 8.000411, {name: 'M 49', size: 6.28, otype: 'Seyfert 2'});
var M100 = A.source(185.728746, 15.822381, {name: 'M 100', size: 7.23, otype: 'AGN'});
var M84 = A.source(186.26559721, 12.88698314, {name: 'M 84', size: 3.91, otype: 'Seyfert 2'});
var M60 = A.source(190.916700, 11.552611, {name: 'M 60', size: 4.75, otype: 'Galaxy in pair of galaxies'});
var NGC4388 = A.source(186.445083, 12.662069 , {name: 'NGC 4388', size: 3.72, otype: 'Seyfert 2'});
var NGC4261 = A.source(184.84673421, 5.82491522 , {name: 'NGC 4261', size: 2.78, otype: 'LINER AGN'});
var M86 = A.source(186.549225, 12.945969, {name: 'M 86', size: 6.03, otype: 'Galaxy in group of galaxies'});
// create catalog layer with custom draw function
var cat = A.catalog({name: 'Virgo cluster', shape: drawFunction});
// add sources to the new layer
cat.addSources([M87, M49, M100, M84, M60, NGC4388, NGC4261, M86]);
aladin.addCatalog(cat);
*/
