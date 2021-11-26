import cv from "@techstark/opencv-js";
import React, { useState, useRef, useEffect } from "react";

//1.Create a canvas, img, input button
//2. create a ref for canvas and img
//3. create a draw function to render dots clicked by a person
//4. create logic for registering more dots through an array
//5. push the canvas image into opencv and do the watershed oneliner

/*
  Making PURE functions 
  a. load image, set it in global ref
  b. clicked points (allow add/remove): store both lists (internal/external points) in global ref
       color external clicked points as green
       color internal clicked points as blue
  c. draw image (original) + clicked points (internal/external)
       ? can we use a function to avoid for(for) loops over pixels?
  d. watershed: f(imgRef/img, clicked_inside, clicked_outside) -> "area-separated image"

 
  */

 

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
  const canvasRef = useRef();
  const imgRef = useRef();
  const waterShedRef = useRef();

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
    cv.imshow(waterShedRef.current, marked_img);

 
 
    

    // need to release them manually
    img.delete();
    marked_img.delete();
   
  };
 

  const [isImageClicked, setIsImageClicked] = useState(false)
  if (isImageClicked) {
    processWatershedImage(document.getElementById("canvas_img")); //Imread takes in ImageSource which is either image from html canvas or img element.
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
    </div>
  );
};
export default App;
