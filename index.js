mapboxgl.accessToken = 'pk.eyJ1IjoiYXF1YXRpY3BvdGF0bzM2NzciLCJhIjoiY2xiNGkxamNhMDd2MDNycHFvaGFhbm5ibCJ9.JOPGAumKnABqtmfkRf2eyw';
let map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/streets-v12',
    center: [-70.27, 41.77],
    projection:'mercator',
    zoom: 9
});
map.addControl(new mapboxgl.NavigationControl());

let vehicles = new Map();
let stops = new Map();
let routes = {};
let parser = new DOMParser();

init();
async function init(){
    let res = await fetch('https://retro.umoiq.com/service/publicXMLFeed?command=routeConfig&a=ccrta');
    let xml = await res.text();
    let data = parser.parseFromString(xml, 'text/xml');
    let routesData = data.getElementsByTagName('route');
    for(let i=0; i<routesData.length; i++){
        let route = {
            'backgroundColor': routesData[i].attributes.color.value,
            'textColor': routesData[i].attributes.oppositeColor.value,
            'name': routesData[i].attributes.title.value,
            'directions': {}
        };
        let dirs = routesData[i].getElementsByTagName('direction');
        for(let j=0; j<dirs.length; j++){
            let tag = dirs[j].attributes.tag.value;
            let name = dirs[j].attributes.title.value;
            route.directions[tag] = name;
        }

        let paths = routesData[i].getElementsByTagName('path');
        let geojson = {
            'type': 'geojson',
            'data': {
                'type': 'FeatureCollection',
                'features': []
            }
        }

        for(let j=0; j<paths.length; j++){
            let obj = {
                'type': 'Feature',
                'properties': {},
                'geometry': {
                    'type': 'LineString',
                    'coordinates': []
                }
            };
            for(let k=0; k<paths[j].children.length; k++){
                obj.geometry.coordinates.push([paths[j].children[k].attributes.lon.value, paths[j].children[k].attributes.lat.value]);
            }
            geojson.data.features.push(obj);
        }

        map.addSource(routesData[i].attributes.title.value, geojson);
        map.addLayer({
            'id':routesData[i].attributes.title.value,
            'type':'line',
            'source':routesData[i].attributes.title.value,
            'layout': {
                'line-join': 'round',
                'line-cap': 'round'
            },
            'paint':{
                'line-color':'#'+routesData[i].attributes.color.value,
                'line-width':5
            }
        });
        // map.on('click',routesData[i].attributes.title.value,(data)=>{
        //     new mapboxgl.Popup()
        //     .setLngLat(data.lngLat)
        //     .setHTML(routesData[i].attributes.title.value)
        //     .addTo(map);
        // });

        routes[routesData[i].attributes.tag.value] = route;
        let stopsData = routesData[i].children;
        for(let j=0; j<stopsData.length; j++){
            if(stopsData[j].nodeName!='stop') break;
            let stop = {
                'lat': stopsData[j].attributes.lat.value,
                'lon': stopsData[j].attributes.lon.value,
                'name': stopsData[j].attributes.title.value,
                'id': stopsData[j].attributes.stopId.value,
            };
            let tag = stopsData[j].attributes.tag;
            let circle = document.createElement('div');
            circle.className = 'stop';
            let popup = new mapboxgl.Popup();
            popup.on('open',async()=>{
                popup.setHTML(stop.name+'<br>loading predictions...');
                let prediction = await fetch('https://retro.umoiq.com/service/publicXMLFeed?command=predictions&a=ccrta&stopId='+stop.id);
                let string = await prediction.text();
                let str = '';
                let predictionData = parser.parseFromString(string,'text/xml').getElementsByTagName('predictions');
                for(let k=0; k<predictionData.length; k++){
                    let predictionRoute = predictionData[k].attributes.routeTitle.value;
                    let noPrediction = predictionData[k].attributes.dirTitleBecauseNoPredictions;
                    if(noPrediction){
                        str += predictionRoute+': no predictions<br>';
                    }else{
                        str += predictionRoute+': <ul>';
                        let directions = predictionData[k].children;
                        for(let l=0; l<directions.length; l++){
                            let direction = directions[l].attributes.title.value;
                            for(let m=0; m<directions[l].children.length; m++){
                                let prediction = directions[l].children[m];
                                str += '<li>'+prediction.attributes.minutes.value+' min toward '+direction+' (vehicle '+prediction.attributes.vehicle.value+')</li>';
                            }
                        }
                        str+='</ul>'
                    }
                }
                popup.setHTML(stop.name+'<br>'+str);
            });
            let marker = new mapboxgl.Marker(circle).setLngLat([stop.lon, stop.lat]).setPopup(popup);
            marker.addTo(map);
            stops.set(tag, marker);
        }
    }
    fetchVehicles();
}

async function fetchVehicles(){
    let res = await fetch('https://retro.umoiq.com/service/publicXMLFeed?command=vehicleLocations&a=ccrta&t=0');
    let xml = await res.text();
    let data = parser.parseFromString(xml,'text/xml');

    let vehiclesData = data.getElementsByTagName('vehicle');
    for(let i=0; i<vehiclesData.length; i++){
        let id = vehiclesData[i].attributes.id.value;
        let route = vehiclesData[i].attributes.routeTag.value;
        let lat = vehiclesData[i].attributes.lat.value;
        let lon = vehiclesData[i].attributes.lon.value;
        let secondsSince = vehiclesData[i].attributes.secsSinceReport.value;
        let predictable = vehiclesData[i].attributes.predictable.value;
        let heading = vehiclesData[i].attributes.heading.value;
        let speed = vehiclesData[i].attributes.speedKmHr.value;
        let dir = vehiclesData[i].attributes.dirTag.value;
        if(!vehicles.has(id)){
            let node = createMarker({
                'label': id,
                'backgroundColor': '#'+routes[route].backgroundColor,
                'textColor': '#'+routes[route].textColor
            });
            let marker = new mapboxgl.Marker(node).setLngLat([lon, lat]);
            marker.setPopup(new mapboxgl.Popup().setHTML('vehicle '+id+' on route '+routes[route].name+' toward '+routes[route].directions[dir]+' moving at '+speed+' km/hr<br>last updated '+secondsSince+' seconds ago'));
            marker.addTo(map);
            vehicles.set(id, {'marker': marker, 'seconds': secondsSince});
        }else{
            let marker = vehicles.get(id).marker;
            vehicles.get(id).seconds = secondsSince;
            marker.getElement().innerHtml = id;
            marker.getElement().style.background = '#'+routes[route].backgroundColor;
            marker.getElement().style.color = '#'+routes[route].textColor;
            marker.setLngLat([lon, lat]);
            marker.getPopup().setHTML('vehicle '+id+' on route '+routes[route].name+' toward '+routes[route].directions[dir]+' moving at '+speed+' km/hr<br>last updated '+secondsSince+' seconds ago')
        }

        for(let [key, value] of vehicles){
            if(value.seconds>600) {
                vehicles.delete(key);
                value.marker.remove();
            }
        }
    }
    setTimeout(fetchVehicles, 10000);
}

function createMarker(obj){
    let div = document.createElement('div');
    let mark = document.createTextNode(obj.label);
    div.style.width = '60px'; div.style.height = '20px'; div.style.textAlign = 'center'; div.style.opacity = 0.8;
    if(obj.textColor) div.style.color = obj.textColor;
    div.style.background = obj.backgroundColor;
    div.appendChild(mark);
    return div;
}

// this is 100% client side right now: todo, add block data? that will require a shift to backend