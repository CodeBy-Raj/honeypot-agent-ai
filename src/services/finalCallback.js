const callback_url = "https://hackathon.guvi.in/api/updateHoneyPotFinalResult";

const finalcallback = async (resultData) => {
  try {
    const response = await fetch(callback_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(resultData),
    });

    if (!response.ok) {
      throw new Error("Something Went Wrong with status: " + response.status);
    }

    const data = await response.json();
    console.log("Callback sent successfully, with data", data);
    return data;
  } catch (error) {
    console.error("Something went wrong", error.message);
    return null;
  }
};

export default finalcallback;
