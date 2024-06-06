const dataMap = [
  { raceName: "Лыжный Турмарафон 2023",
    season: 2023,
    needLoad: true,
    distances: [
      {fullName: "Лыжный ТМ 2023, 20km Lite",
        name: "25km Lite",
        fileName: "лыжный2023_20.txt"
      },
      {fullName: "Лыжный Турмарафон 2023 30km Tourist",
        name: "30km Tourist",
        fileName: "лыжный2023_30.txt",
      },
    ],
  },
  { raceName: "Весенний Турмарафон 2024",
    season: 2024,
    needLoad: true,
    distances: [
      {fullName: "Весенний ТМ 2024, 25km Lite",
        name: "25km Lite",
        fileName: "весна2024_25.txt"
      },
      {fullName: "Весенний ТМ 2024, 50km Tourist",
        name: "50km Tourist",
        fileName: "весна2024_50.txt",
      },
      {fullName: "Весенний ТМ 2024, 75km Ultra",
        name: "75km Ultra",
        fileName: "весна2024_75.txt",
      },
    ],
  },
  { raceName: "Зимний Турмарафон 2023",
    season: 2023,
    needLoad: false,
    distances: [
      {fullName: "Зимний Турмарафон 2023 25km Lite",
        name: "25km Lite",
        fileName: "зима2023_25.txt"
      },
      {fullName: "Зимний Турмарафон 2023 55km Tourist",
        name: "55km Tourist",
        fileName: "зима2023_55.txt",
      },
    ],
  },

];



const axios = require('axios');

const fs = require('fs');

const isNumber = n => !isNaN(n);

const instance = axios.create({
  baseURL: 'http://127.0.0.1:1337/api',
  timeout: 15000,
});

instance.interceptors.request.use(req => {
    //const token = localStorage.getItem(`token`);
    const token = ``;
    req.headers.Authorization = `${token}`;
  return req;
});



const postRace = async ({raceName, season}) => {

  const raceData = {
    data: {
      name: raceName,
      season,
    }
  }

  let filterString = "?filters[name][$eq]=" + raceName;
  let raceId;

  const resSearch = await instance.get(`/races${filterString}`);
  if (resSearch.data.data.length) {
    raceId = resSearch.data.data[0].id;
  } else {
    const ress = await instance.post(`/races`, raceData);
    raceId = ress.data.data.id;
  }

  return raceId;

}


const postDistance = async ({fullName, name, raceId}) => {

  const distanceData = {
    data: {
      fullName,
      name,
      race: raceId,
    }
  }

  let filterString = "?filters[fullName][$eq]=" + fullName;
  let distanceId;

  const resSearch = await instance.get(`/distances${filterString}`);
  if (resSearch.data.data.length) {
    distanceId = resSearch.data.data[0].id;
  } else {
    const ress = await instance.post(`/distances`, distanceData);
    distanceId = ress.data.data.id;
  }

  return distanceId;

}







const myToDate = ddateStr => {
  if (ddateStr === "dns" || ddateStr === "dnf" || ddateStr === "DNS" ||ddateStr === "DNF") return null;

  const midPos = ddateStr.indexOf(" ");
  const part1 = ddateStr.substring(0, midPos).replaceAll(".", "-");
  let part2 = ddateStr.substring(midPos + 1).trimEnd();
  if (part2.length < 5) part2 = "0" + part2;
  return part1 + "T" + part2;
}

const postRunner = async (data, runners) => {
  const {firstName, lastName, midName, year, location} = data;
  const pData = {
    "data": {
      "firstName": firstName,
      "lastName": lastName,
      "midName": midName,
      "year": year,
      "location": location,
  }
  }

  let filterString = "?";
  filterString += (firstName ? "filters[firstName][$eq]=" + firstName : "filters[firstName][$null]=true") + "&";
  filterString += (lastName ? "filters[lastName][$eq]=" + lastName : "filters[lastName][$null]=true") + "&";
  filterString += (midName ? "filters[midName][$eq]=" + midName : "filters[midName][$null]=true") + "&";

  const resSearch = await instance.get(`/runners${filterString}`);
  if (resSearch.data.data.length) {
    runners.push(resSearch.data.data[0].id);
  } else {
    const ress = await instance.post(`/runners`, pData);
    runners.push(ress.data.data.id);
  }

}

const postTeam = async ({distance, name, start, finish, comm, runners, place, runnersChildren}) => {

  const pData = {
    "data": {
      "distance": distance,
      "name": name,
      "runners": runners,
      "start": start,
      "finish": finish,
      "comm": comm,
      "place": place,
      "runnersChildren": runnersChildren,
    }
  }

  const ress = await instance.post(`/teams`, pData);

}


const parseRunner = str => {

   const res = {
     lastName: null,
     firstName: null,
     midName: null,
     year: null,
     location: null,
     kid: false,
     dns: false,
   }

   const rData = str.split(",");

   for (let i = 0; i < rData.length; i++) {
     if (!i) {
       //Считываем ФИО
       let progress = -1;
       for (let item of rData[0].split(" ")) {
         if (!item) continue;
         if (item === "del") {
           res.dns = true;
           continue;
         }
         progress++;
         if (progress === 0) {
           res.lastName = item;
           continue;
         }
         if (progress === 1) {
           res.firstName = item;
           continue;
         }
         if (progress === 2) {
           res.midName = item;
         }
       }
     } else {
       //Считываем остальное: год и город
       if (rData[i].trim) {
         if (isNumber(rData[i])) {
           //это год
           res.year = +rData[i];
         } else {
           //это город
           res.location = rData[i].trim();
         }
     }
     }
   }

  if (res.lastName && !res.firstName) {
    res.firstName = res.lastName;
    res.lastName = null;
  }

  return res;
}

const parseKids = str => {

  const resAll = [];
  const rDataAll = str.split(";");

  for (let rData of rDataAll) {

    rData = rData.split(",");

    const res = {
      lastName: null,
      firstName: null,
      midName: null,
      year: null,
      location: null,
      kid: true,
      dns: false,
    }


    for (let i = 0; i < rData.length; i++) {
      if (!i) {
        //Считываем ФИО
        let progress = -1;
        for (let item of rData[0].split(" ")) {
          if (!item) continue;
          if (item === "del") {
            res.dns = true;
            continue;
          }
          progress++;
          if (progress === 0) {
            res.lastName = item;
            continue;
          }
          if (progress === 1) {
            res.firstName = item;
            continue;
          }
          if (progress === 2) {
            res.midName = item;
          }
        }
      } else {
        //Считываем остальное: год и город
        if (rData[i].trim) {
          if (isNumber(rData[i])) {
            //это год
            res.year = +rData[i];
          } else {
            //это город
            res.location = rData[i].trim();
          }
        }
      }
    }

    if (res.lastName && !res.firstName) {
      res.firstName = res.lastName;
      res.lastName = null;
    }
    resAll.push(res);

  }

  return resAll;
}


const fLoadRace = async (race) => {

  console.log("Загружаем гонку: " + race.raceName);
  const raceId = await postRace(race);
  console.log("");

  for (let distance of race.distances) {

    console.log("Загружаем дистанцию: " + distance.name);
    const distanceId = await postDistance({fullName: distance.fullName, name: distance.name, raceId});
    const data = fs.readFileSync("data/" + distance.fileName).toString().split(`\n`).map(i => i.split(`\t`));

    for (const item of data) {

      let runners = [];
      let runnersChildren = [];

      let res;
      res = item[2] ? parseRunner(item[2]) : null;
      if (res) await postRunner(res, runners);
      res = item[3] ? parseRunner(item[3]) : null;
      if (res) await postRunner(res, runners);
      res = item[4] ? parseRunner(item[4]) : null;
      if (res) await postRunner(res, runners);
      res = item[5] ? parseKids(item[5]) : [];
      if (res.length) {
        for (const item2 of res) await postRunner(item2, runnersChildren);
      }

      let teamData = {};

      teamData.place = item[0];
      teamData.name = item[1] ? item[1] : null;
      teamData.start = item[6] ? myToDate(item[6]) : null;
      teamData.finish = item[7] ? myToDate(item[7]) : null;
      teamData.comm = item[9] ? item[9] : null;
      teamData.runners = runners;
      teamData.runnersChildren = runnersChildren;
      teamData.distance = distanceId;

      await postTeam(teamData);


    }

    console.log("...done");
    console.log("");
    console.log("");



  };


}

const fLoadAll = async () => {

  for (let item of dataMap) {
    if (item.needLoad) {
      await fLoadRace(item);
    }
  }

}



fLoadAll();
