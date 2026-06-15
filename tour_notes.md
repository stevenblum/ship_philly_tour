The previous presenter will cover ISA-95, Sensors, SCADA, Digital Twins, and other related topics. I will be covering MES, which is a critical component of the manufacturing process that connects the shop floor to the enterprise level. Here are the slides in the order that I want to present them. 
# What is MES?

# MESA 11 Functions

# Foundation of MES

# More Than a Dashboard: Scheduling

# More Than a Dashboard: Assignment

# More Than a Dashboard: Maintenance

# MES, Enabler of AI/LM 

# Why Shipyards Need Purpose Built MES

# Hanwha Philly Shipyard

Can you provide a good working definition of an MES that I can use in slide 1 please.


* Shipyard Overview
* Steel Storage Yard
* Cutting Shop
* Panel Production Shops
    * Show Images for all 5 panel production shops at the same time.
    - Web Shop
    - Large Panel Shop
    - Double Bottom Shop
    - Bulkhead Shop
    - Curved Panel Shop
* Section Assembly Shop
* Outfitting Shop
* Block Assembly Shop
* Painting Shop
* Grand Block Assembly Area
* Building Dock
* Outfitting Dock

# WIP Flight
I've added a new kml file to the project called "WIP_tour.kml". This file contains old shop location placemarks, so DO NOT USE THEM. But the kml file also contains a new `WIP Tour` poly line. I want to introduce this poly line as a fly through path for a "presentation" in the cesium app. I want this to be the second to last slide, just before the full graph slide. I want the "slide" to follow the path of the polyline, at 10 ft above the surface of whatever terrain is currently shown; so that would end up being a fixed distance above a flat satellite image. I would like the full flight to take about 1 minute. You will need to convert the polyline into a SampledPositionProperty, and then createa moving entity that follows the path, and attached the camera. Do not draw the polyline itself anywhere in the app, just use it as a path for the camera to follow. The camera should be looking forward along the path, and should maintain a constant altitude of 10 ft above the surface. The flight should start at the beginning of the polyline and end at the end of the polyline, taking approximately 1 minute to complete. To make the camera movement smooth, please implement hermite spline interpolation. here are some examples of how to impelemnt, but please develop a more effective implementation that is tailored to our specific implementation:

const positionProperty = new Cesium.SampledPositionProperty();
// Add samples: (Time, Cartesian3 Position)
positionProperty.addSample(startTime, Cesium.Cartesian3.fromDegrees(lon, lat, height));
positionProperty.addSample(stopTime, Cesium.Cartesian3.fromDegrees(lon, lat, height));


const movingObject = viewer.entities.add({
    availability: new Cesium.TimeIntervalCollection([new Cesium.TimeInterval({ start: startTime, stop: stopTime })]),
    position: positionProperty,
    // Add a 3D model, or leave it blank to just have a moving focal point
    model: {
        uri: 'path/to/your/model.gltf',
        scale: 0.001 // Make it invisible
    }
});

// Lock the camera to the moving object
viewer.trackedEntity = movingObject;

viewer.entities.add({
    polyline: {
        positions: Cesium.Cartesian3.fromDegreesArrayHeights([
            lon1, lat1, height1,
            lon2, lat2, height2
        ]),
        width: 5,
        material: Cesium.Color.RED,
        clampToGround: true // Keeps the line on the terrain
    }
});

// 1. Change the math formula to a smooth curve
positionProperty.setInterpolationOptions({
    interpolationDegree: 2,
    interpolationAlgorithm: Cesium.HermitePolynomialApproximation
});