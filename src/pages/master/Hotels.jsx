
import React, { useEffect, useState } from "react";
import axiosInstance from "../../components/AxiosInstance";

const Hotels = () => {
  const [hotels, setHotels] = useState([]);  

  const hotelList = async () => {
   

    try {
      const response = await axiosInstance.get("/api/hotels",);
      setHotels(response.data);
    } catch (error) {
      console.log("error::", error);
    }
  };

  useEffect(() => {
    hotelList();
  }, []);

  return (
    <div className="container">
      <h2 className="text-center">List of Hotels</h2>
      <div className="table-responsive">
      <table className="table table-striped table-bordered">
        <thead>
          <caption>Hotel List</caption>
          <tr>
            <th> Id</th>
            <th>Hotel Name</th>
            <th>Description</th>
            <th>Address</th>
          </tr>
        </thead>
        <tbody>
          {hotels.map((ob) => (
            <tr key={ob.id}>
              <td>{ob.id}</td>
              <td>{ob.hotelName}</td>
              <td>{ob.hotelDescription}</td>
              <td>{ob.address}</td>
            </tr>
          ))}
          <tr></tr>
        </tbody>
      </table>
      </div>
    </div>
  );
};

export default Hotels;
