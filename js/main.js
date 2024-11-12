const urlParams = new URLSearchParams(window.location.search);
const MAP_NAME = urlParams.get('map');

const ATTRIBUTION = '© <a href="https://o-maps.spb.ru" target="_blank">O-maps</a>';

const ZERO_LATLNG = new L.LatLng(0, 0);
const centerX = 59.944179;
const centerY = 30.320337;

const multiX = 1e-5;
const multiY = 2e-5;

let map;
let opacitySlider;
let marker1, marker2, marker3;
let loaded = false;

let maxZindex = 1;
let enablePopup = false;

let editMode = false;
let mapOpacity = 1;
let selectedOverlay, selectedMap;

let mapOverlays = [];

let osmMap = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: ATTRIBUTION
});
let openTopoMap = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: ATTRIBUTION
});

let rogaineGroup = L.layerGroup([]);

let oMaps = [
    ...rogaineMaps,
];

const TOTAL_MAPS = oMaps.length;

// Overlay the maps
for (const m of oMaps) {
    m.img = new Image();
    m.img.src = m.url;

    m.img.onload = function () {
        let bounds;
        if (m.bounds.length === 3) {
            bounds = m.bounds;
        } else {
            bounds = [
                m.bounds[0],
                [m.bounds[0][0], m.bounds[0][1] + m.img.width * multiY],
                [m.bounds[0][0] - m.img.height * multiX, m.bounds[0][1]]
            ];
        }
        let latLngs = [
            L.latLng(bounds[0]),
            L.latLng(bounds[1]),
            L.latLng(bounds[2])
        ];
        let imgLayer = L.imageOverlay.rotated(
            m.url, latLngs[0], latLngs[1], latLngs[2],
            {
                opacity: 1,
                interactive: true,
                alt: m.name
            });

        // map popup
        let popup = buildPopupText(m, latLngs);
        imgLayer.bindPopup(popup);
        imgLayer.on('mouseover', function (e) {
            if (!editMode && enablePopup) {
                this.openPopup();
            }
        });

        imgLayer.on('click', function (e) {
            onMapSelect(imgLayer, m);
        });

        let added = false;
        if (m.types.includes('ROGAINE')) {
            added = true;
            imgLayer.addTo(rogaineGroup);
        }

        if (m.zindex) {
            let el = imgLayer.getElement();
            if (el) {
                el.style.zIndex = m.zindex;
            }
        }

        mapOverlays.push(imgLayer);

        if (m.link) {
            let el = imgLayer.getElement();
            if (el) {
                el.classList.add('full-size');
            }
        }
    }
}

const defaultZoom = 11;

let mapElement = document.getElementById('map');
if (mapElement) {
    const savedState = loadMapState();
    map = L.map('map', {
        attributionControl: false,
        zoomControl: false,
        minZoom: 8,
        maxZoom: 18,
        center: savedState ? [savedState.lat, savedState.lng] : [centerX, centerY],
        zoom: savedState ? savedState.zoom : defaultZoom,
        layers: [
            osmMap, rogaineGroup
        ],
        contextmenu: true,
        contextmenuWidth: 160,
        contextmenuItems: [{
            text: 'Координаты',
            callback: showCoordinates
        }, {
            text: 'Центр сюда',
            callback: centerMap
        }, '-', {
            text: 'Увеличить',
            icon: 'images/zoom-in.png',
            callback: zoomIn
        }, {
            text: 'Уменьшить',
            icon: 'images/zoom-out.png',
            callback: zoomOut
        }, '-', {
            text: 'Всплыв.подсказки',
            icon: 'images/popup.png',
            callback: popupsSwitch
        }, {
            text: 'Редактирование',
            icon: 'images/edit.png',
            callback: editModeSwitch
        }]
    });

    map.on('click', onMapClick);
    map.on('overlayadd overlayremove zoomlevelschange resize zoomend moveend', function () { recalculateLayers();} );
    osmMap.on('load', function () {
        recalculateLayers();
        if (!loaded) {
            loaded = true;
            if (MAP_NAME) {
                locateMap(MAP_NAME);
            }
        }
    });

    // Save the map state whenever the map is moved or zoomed
    map.on('moveend', () => saveMapState(map));
    map.on('zoomend', () => saveMapState(map));

    L.control.scale().addTo(map);

    // Instantiate the ZoomBar control..
    new L.Control.ZoomBar({position: 'topleft'}).addTo(map);

    let attributionControl = L.control.attribution().addTo(map);
    attributionControl.setPrefix('<a href="https://leafletjs.com/">Leaflet</a>');

    // Set bounds for the overlay
    //map.fitBounds(oMap.getBounds());

    marker1 = L.marker(ZERO_LATLNG, {draggable: true}).addTo(map);
    marker2 = L.marker(ZERO_LATLNG, {draggable: true}).addTo(map);
    marker3 = L.marker(ZERO_LATLNG, {draggable: true}).addTo(map);
    marker1.on('drag', onDrag);
    marker2.on('drag', onDrag);
    marker3.on('drag', onDrag);
    marker1.on('dragend', onDragEnd);
    marker2.on('dragend', onDragEnd);
    marker3.on('dragend', onDragEnd);

    // --- ruler (https://github.com/gokertanrisever/leaflet-ruler) ---
    let rulerOptions = {
        position: 'topleft',
        lengthUnit: {
            display: 'км',
            decimal: 2,
            factor: null,
            label: 'Расстояние:'
        },
        angleUnit: {
            display: '&deg;',
            decimal: 2,
            factor: null,
            label: 'Азимут:'
        }
    };
    L.control.ruler(rulerOptions).addTo(map);

    // --- slider (https://github.com/Eclipse1979/leaflet-slider) ---
    let sliderOptions = {
        id: 'opacitySlider',
        orientation: 'vertical',
        title: 'Прозрачность карт',
        min: 0,
        max: 1,
        step: .1,
        size: '100px',
        position: 'topleft',
        value: mapOpacity,
        logo: '⛅',
        showValue: false,
        syncSlider: true
    };
    opacitySlider = L.control.slider(function(value) {setOverlayOpacity(value);}, sliderOptions).addTo(map);}

// --- functions ---

function buildPopupText(map, latLngs) {
    // имя
    let result = '<b>' + map.name;
    if (map.year) {
        result += '&nbsp;(' + map.year + ')';
    }

    // площадь
    let area = getArea(latLngs);
    result += '&nbsp;-&nbsp;' + area + '&nbsp;км<sup>2</sup>';
    result += '</b><hr />';

    // инфа о карте
    let info = map.info;
    let link = map.link;
    if (info) {
        result += info + '<br />';
    }

    // ссылки на просмотр и скачивание
    if (link) {
        result += 'Скачать можно <a href="' + link + '" target="_blank">тут</a>.';
    } else {
        result += 'Посмотреть карту отдельно можно <a href="' + map.url + '" target="_blank">тут</a>.';
    }
    let mapLinkUrl = mapLink(map.url);
    let onclick = 'onclick="copyToClipboard(\'' + mapLinkUrl + '\'); return false;"';
    result += '<br />Поделиться <a href="' + mapLinkUrl + '" target="_blank">ссылкой</a> на карту: <a href="#" ' + onclick + ' target="_blank"><img src="./images/copy.png" alt="Copy" title="Copy" style="margin-bottom: -3px;" /></a>';
    return result;
}

function onMapSelect(ovrl, map) {
    selectedOverlay = ovrl;
    selectedMap = map;

    ovrl.getElement().style.zIndex = maxZindex++;

    if (editMode) {
        marker1.setLatLng(ovrl.getTopLeft());
        marker2.setLatLng(ovrl.getTopRight());
        marker3.setLatLng(ovrl.getBottomLeft());
    }
}

function onMapClick(e) {
    let coordinate = e.latlng.lat + ", " + e.latlng.lng;
    copyToClipboard(coordinate);
}

function repositionImage(doLog) {
    let point1 = marker1.getLatLng();
    let point2 = marker2.getLatLng();
    let point3 = marker3.getLatLng();
    if (doLog) {
        let coordinates = "[[" + point1.lat + ", " + point1.lng + "], [" + point2.lat + ", " + point2.lng + "], [" + point3.lat + ", " + point3.lng + "]],";
        copyToClipboard(coordinates);
    }
    if (selectedOverlay) {
        selectedOverlay.reposition(point1, point2, point3);
    }
}

function onDrag() {
    repositionImage(false);
}

function onDragEnd() {
    repositionImage(true);
}

// --- context menu functions ---

function showCoordinates (e) {
    alert(e.latlng);
}

function centerMap (e) {
    map.panTo(e.latlng);
}

function zoomIn (e) {
    map.zoomIn();
}

function zoomOut (e) {
    map.zoomOut();
}

function editModeSwitch (e) {
    editMode = !editMode;
    if (!editMode) {
        marker1.setLatLng(ZERO_LATLNG);
        marker2.setLatLng(ZERO_LATLNG);
        marker3.setLatLng(ZERO_LATLNG);
        setOverlayOpacity(1);
    } else {
        setOverlayOpacity(.5);
    }
    opacitySlider.setValue(mapOpacity);
    // map.removeControl(opacitySlider);
}

function popupsSwitch (e) {
    enablePopup = !enablePopup;
}
