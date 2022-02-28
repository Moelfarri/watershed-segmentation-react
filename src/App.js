import cv from "@techstark/opencv-js";
import React, { useState, useRef, useEffect } from "react";

 
 

//UTILITY FUNCTIONS
function euclidean_distance(clicked_point, p) {
  return Math.sqrt(Math.pow(clicked_point.x - p.x, 2) + Math.pow(clicked_point.y - p.y, 2))
}



let imgDots = [];

const addImgDots = (x, y, dotType) => {
  imgDots.push({ x: x, y: y, dotType: dotType });
};

const deleteImgDots = (x,y) => {
  if (imgDots.length === 0){return}
  let clicked_point = { x: x, y: y }
  let closest = imgDots.reduce((a, b) => euclidean_distance(clicked_point, a) < euclidean_distance(clicked_point, b) ? a : b)

  //delete only if click is within a certain threshold of closeness
  if (euclidean_distance(clicked_point, closest) <= 5){
    imgDots.indexOf(closest) !== -1 && imgDots.splice(imgDots.indexOf(closest), 1)
  }
 
};

const App = () => {
  //IMPORTANT PARAMETERS 
  const LPP_IN_METERS = 265
  const DRAUGHT_IN_METERS  = 15 //vertical distance between waterline and bottom of the hull

  //CLICKED PARAMETERS
  const LPP_x_min = 105
  const LPP_x_max = 737
  const LPP_PIXELS = LPP_x_max - LPP_x_min
  const BOTTOM_PIXELS = 710 
 

  //FROM_METERS_TO_PIXEL
  const meterToPixel = LPP_PIXELS/LPP_IN_METERS
  const pixelToMeter = LPP_IN_METERS/LPP_PIXELS



  const canvasRef = useRef();
  const imgRef = useRef();
  const waterShedRef = useRef();
  const areaRef = useRef();

  const [imgUrl, setImgUrl] = useState(null);
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);

  const [dotType, setDotType] = useState("INTERNAL_DOT");
  const [dotState, setDotState] = useState("ADD_DOT");

  //javascript react interactive logic here:
  const draw = (context) => {
    context.drawImage(imgRef.current, 0, 0);

    for (let i = 0; i < imgDots.length; i++) {
      if (imgDots[i].dotType === "EXTERNAL_DOT") {
        context.fillStyle = "rgb(255, 0, 0)";
      } else if (imgDots[i].dotType === "INTERNAL_DOT") {
        context.fillStyle = "rgb(0, 0, 255)";
      }

      context.beginPath();
      context.arc(imgDots[i].x, imgDots[i].y, 5, 0, 2 * Math.PI);
      context.fill();
    }
   
  };

  useEffect(() => {
    const context = canvasRef.current.getContext("2d");
    draw(context);
  });
  //----

  //OpenCV logic here:
  const processWatershedImage = (imgSrc) => {
    let img = cv.imread(imgSrc);
    cv.cvtColor(img, img, cv.COLOR_RGBA2RGB, 0);


    //--------------
    //This part only improves the segmentation quality of the watershed pipeline and is strictly not necessary for the watershed algorithm to work
    let edges = new cv.Mat()
    let gray_img = img.clone()
    cv.cvtColor(gray_img, gray_img, cv.COLOR_RGB2GRAY, 0);
    //Take read image through morphology pipeline for higher quality segmentation
    

    
    cv.Canny(gray_img, edges, 50, 210)

    let kernel = cv.matFromArray(3,3,cv.CV_8U, [255, 255, 255, 255, 8, 255, 255, 255, 255]) 
    cv.morphologyEx(edges, img, cv.MORPH_CLOSE, kernel, new cv.Point(0, 0), 1)
    cv.bitwise_not(img, img)
    cv.cvtColor(img, img, cv.COLOR_RGBA2RGB, 0);
    //--------------





    let marked_img = new cv.Mat.zeros(img.cols, img.rows, cv.CV_32S); //(width, height)
    

    for (let i = 0; i < imgDots.length; i++) {
      //External Marker
      if (imgDots[i].dotType === "EXTERNAL_DOT") {
        cv.circle(
          marked_img,
          new cv.Point(imgDots[i].x, imgDots[i].y),
          5,
          [255, 0, 0, 255], //important to distnguish first element in array for differentiatig internal from external so, 1,2 or 100, 255, etcc..
          -1
        );
      }
      //Internal Marker
      else {
        cv.circle(
          marked_img,
          new cv.Point(imgDots[i].x, imgDots[i].y),
          5,
          [125, 0, 0, 255], 
          -1
        );
      }
    }

    
    

    //marked_img needs to be CV_32S for the watershed algorithm
     cv.watershed(img, marked_img);



    //Uint (CV_8U) necessary for imshow of the marked image
    marked_img.convertTo(marked_img, cv.CV_8U)
    cv.cvtColor(marked_img, img, cv.COLOR_RGBA2RGB, 0);
    cv.imshow(waterShedRef.current, img);


 
 
    

    // need to release them manually
    img.delete();
    marked_img.delete();
    edges.delete();
    gray_img.delete();
    kernel.delete();
   
  };



  //GET AREA-SEGMENTS:
  //TODO: SORT ALL CONTOURS BASED ON BIGGEST AREAS DOWN TO SMALLEST AREA
  //TODO: look into the bug happening with semisub_complicated_air
  const processWindCurrentAreaSegments = (segmentedImgSrc, originalImageSrc) => {
    let img = cv.imread(segmentedImgSrc);
    let unedited_img = cv.imread(originalImageSrc);
 
    let w_contours = new cv.MatVector();
    let w_hierarchy = new cv.Mat();
    let c_contours = new cv.MatVector();
    let c_hierarchy = new cv.Mat();
    


    //find midship index
    let LPP_LENGTH_PIXELS = LPP_x_max - LPP_x_min
    let xMidshipIndex = LPP_x_min + LPP_LENGTH_PIXELS/2

    //waterline
    let waterline_pixels = BOTTOM_PIXELS - DRAUGHT_IN_METERS*(LPP_LENGTH_PIXELS/LPP_IN_METERS)  
 
    //remove black border around image that waterShed algorithm makes
    cv.rectangle(img, new cv.Point(0,0), new cv.Point(img.size().height, img.size().width), [255, 255, 255, 255], 3)
    cv.cvtColor(img, img, cv.COLOR_RGBA2GRAY, 0);
    cv.threshold(img, img, 150, 255, cv.THRESH_BINARY_INV)
 
    let wind_segment    = img.clone()
    let current_segment = img.clone()



    //wind and current segments
    cv.rectangle(wind_segment , new cv.Point(0,waterline_pixels), new cv.Point(img.size().height, img.size().width), [0, 0, 0, 255], -1)
    cv.rectangle(current_segment , new cv.Point(0,0), new cv.Point(img.size().height,waterline_pixels), [0, 0, 0, 255], -1)

    //wind contours
    cv.findContours(wind_segment, w_contours, w_hierarchy,cv.RETR_TREE, cv.CHAIN_APPROX_NONE)
    cv.drawContours(wind_segment, w_contours, 0, [255, 0, 0, 255], 1, cv.LINE_8, w_hierarchy, 100)
    
    //wind centroid and area
    let cx_wind = cv.moments(w_contours.get(0), false).m10/cv.moments(w_contours.get(0), false).m00
    let cy_wind = cv.moments(w_contours.get(0), false).m01/cv.moments(w_contours.get(0), false).m00

    //current contours
    cv.findContours(current_segment, c_contours, c_hierarchy,cv.RETR_TREE, cv.CHAIN_APPROX_NONE)
    cv.drawContours(current_segment, c_contours, 0, [255, 0, 0, 255], 1, cv.LINE_8, c_hierarchy, 100)

     
    //current centroid and area
    let cx_current = cv.moments(c_contours.get(0), false).m10/cv.moments(c_contours.get(0), false).m00
    let cy_current = cv.moments(c_contours.get(0), false).m01/cv.moments(c_contours.get(0), false).m00

    //display the end result
    cv.drawContours(unedited_img, w_contours, -1, [0, 255, 0, 255], -1)
    cv.drawContours(unedited_img, c_contours, -1, [0, 0, 255, 255], -1)
    cv.circle(unedited_img, new cv.Point(cx_wind,cy_wind), 2, [0, 0, 0, 255], 5) //wind centroid
    cv.circle(unedited_img, new cv.Point(cx_current,cy_current), 2, [0, 0, 0, 255], 5) //current centroid
    cv.circle(unedited_img, new cv.Point(xMidshipIndex,(cy_wind + cy_current)/2), 2, [255, 255, 255, 255], 5) //midship centroid
    
    //wind and current areas in meter

    

    let pixel_wind_area    = cv.contourArea(w_contours.get(0))
    let pixel_current_area = cv.contourArea(c_contours.get(0))

    let wind_air_area    = 0
    let current_air_area = 0

    //assumes that 0 is outer_contour (if sorted properly)
    if(w_contours.size() > 1){for (let i = 1; i < w_contours.size(); i++){wind_air_area+= cv.contourArea(w_contours.get(i));}}
    if(c_contours.size() > 1){for (let i = 1; i < c_contours.size(); i++){current_air_area += cv.contourArea(c_contours.get(i));}}
    
    //removing air areas
    pixel_wind_area = pixel_wind_area - wind_air_area
    pixel_current_area = pixel_current_area - current_air_area

    //converting to m2
    let meter_wind_area = pixel_wind_area*pixelToMeter*pixelToMeter //pixel squared to m squared
    let meter_current_area = pixel_current_area*pixelToMeter*pixelToMeter 
    
    console.log("WIND_AREA:", meter_wind_area)
    console.log("CURRENT_AREA:", meter_current_area)
    

    //xL wind and current
    let xL_wind    = Math.abs(cx_wind - xMidshipIndex)*pixelToMeter 
    let xL_current = Math.abs(cx_current - xMidshipIndex)*pixelToMeter  

    console.log("xL_wind:",    xL_wind)
    console.log("xL_current:", xL_current)


    cv.imshow(areaRef.current, unedited_img);

    // need to release them manually
    img.delete()
    unedited_img.delete()
    wind_segment.delete()
    current_segment.delete()
    w_contours.delete()
    w_hierarchy.delete()
    c_contours.delete()
    c_hierarchy.delete()
 
  }
 

  const [isImageClicked, setIsImageClicked] = useState(false)
  if (isImageClicked) {
    processWatershedImage(document.getElementById("canvas_img")); //Imread takes in ImageSource which is either image from html canvas or img element.
    processWindCurrentAreaSegments(waterShedRef.current, imgRef.current)
    setIsImageClicked(false)
  }
  

  return (
    <div>
      <input
        type="file"
        name="file"
        accept="image/*"
        onChange={(e) => {
          if (e.target.files[0]) {
            setImgUrl(URL.createObjectURL(e.target.files[0]));
          }
        }}
      />
      <div style={{ margin: "10px" }}>↓↓↓ The original image ↓↓↓</div>
      <div>
        <img ref={imgRef} src={imgUrl} />
      </div>
      <div style={{ margin: "10px" }}>↓↓↓ Canvas Editing ↓↓↓</div>
      <div>
        <div style={{ textAlign: "center" }}>
          <span>
            <button
              onClick={() => {
                setDotType("INTERNAL_DOT");
                setDotState("ADD_DOT");
              }}
            >
              Internal Dots
            </button>{" "}
            <button
              onClick={() => {
                setDotType("EXTERNAL_DOT");
                setDotState("ADD_DOT");
              }}
            >
              External Dots
            </button>
            <button
              onClick={() => {
                setDotState("DELETE_DOT");
              }}
            >
              Delete Dots
            </button>
          </span>
        </div>
        <canvas
          id="canvas_img"
          ref={canvasRef}
          height={800}
          width={800}
          onMouseMove={(e) => {
            //for displayment purposes for the user
            let yImg = e.clientY - e.target.getBoundingClientRect().top; // Y

            let xImg = e.clientX - e.target.getBoundingClientRect().left; // X
            setX(xImg);
            setY(yImg);
          }}
          onClick={(e) => {
            let yImg = e.clientY - e.target.getBoundingClientRect().top; // Y

            let xImg = e.clientX - e.target.getBoundingClientRect().left; // X

            //everytime you click add new point to the dot array to use in openCV later
            if (dotState === "DELETE_DOT") {
              deleteImgDots(xImg, Math.round(yImg))
              setIsImageClicked(true)
            } else {
              addImgDots(xImg, Math.round(yImg), dotType);
              setIsImageClicked(true)
            }
          }}
        />
      </div>
      <h4>{String(Math.round(x)) + "," + String(Math.round(y))}</h4>
      <div style={{ margin: "10px" }}>↓↓↓ Watershed algorithm - OPENCV MAGIC BABY ↓↓↓</div>
      <canvas id="canvas" ref={waterShedRef} width={800} height={800} />

      <div style={{ margin: "10px" }}>↓↓↓ WIND AND CURRENT AREA - OPENCV ↓↓↓</div>
      <canvas id="areaCanvas" ref={areaRef} width={800} height={800}  />
 
    </div>
  );
};
export default App;



 