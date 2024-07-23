import axios from 'axios';
import fs from 'fs';

import { dataMap } from './dataMap.js';
import dayjs from 'dayjs';


const isNumber = n => !isNaN(n);
const myToDate = ddateStr => {
  if (ddateStr === "dns" || ddateStr === "dnf" || ddateStr === "DNS" ||ddateStr === "DNF") return null;

  const midPos = ddateStr.indexOf(" ");
  const part1 = ddateStr.substring(0, midPos).replaceAll(".", "-");
  let part2 = ddateStr.substring(midPos + 1).trimEnd();
  if (part2.length < 5) part2 = "0" + part2;
  return part1 + "T" + part2;
}


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



const postRace = async ({id, raceName, ddate, sname, location}) => {

  const raceData = {
    id,
    data: {
      name: raceName,
      ddate,
      sname,
      location,
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


const postDistance = async ({fullName, name, raceId, km, courseType}) => {

  const distanceData = {
    data: {
      fullName,
      name,
      race: raceId,
      km,
      courseType
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

const postMember = async (data) => {
  const {runner, dns, dnf, child} = data;
  const membersData = {
    "data": {
      "runner": runner,
      "dns": dns,
      "dnf": dnf,
      "child": child,
    }
  }

  const ress = await instance.post(`/members`, membersData);

  return ress.data.data.id;

}

const postRunner = async (data, members) => {
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
  let runnerId;
  if (resSearch.data.data.length) {
    runnerId = resSearch.data.data[0].id;
  } else {
    const ress = await instance.post(`/runners`, pData);
    runnerId = ress.data.data.id;
  }

  data.runner = runnerId;
  const memberId = await postMember(data);
  members.push(memberId);


}

const postTeam = async ({distance, name, start, finish, comm, place, members, result, dns, dnf}) => {

  const pData = {
    "data": {
      "distance": distance,
      "name": name,
      "start": start,
      "finish": finish,
      "comm": comm,
      "place": place,
      "result": result,
      "members": members,
      "dns": dns,
      "dnf": dnf,
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
     dns: false,
     dnf: false,
     child: false,
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
      child: true,
      dns: false,
      dnf: false,
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

  const KV = 60 * 24;

  console.log("Загружаем гонку: " + race.raceName);
  const raceId = await postRace(race);
  console.log("");

  for (let distance of race.distances) {

    console.log("Загружаем дистанцию: " + distance.name);
    const distanceId = await postDistance(
      {fullName: distance.fullName,
        name: distance.name,
        raceId,
        km: distance.km,
        courseType: distance.courseType,
      });

    if (race.needLoad) {

      const data = fs.readFileSync("data/" + distance.fileName).toString().split(`\n`).map(i => i.split(`\t`));

      for (const item of data) {

        let members = [];

        let res;
        res = item[2] ? parseRunner(item[2]) : null;
        if (res) await postRunner(res, members);
        res = item[3] ? parseRunner(item[3]) : null;
        if (res) await postRunner(res, members);
        res = item[4] ? parseRunner(item[4]) : null;
        if (res) await postRunner(res, members);
        res = item[5] ? parseKids(item[5]) : [];
        if (res.length) {
          for (const item2 of res) await postRunner(item2, members);
        }

        let teamData = {};

        teamData.name = item[1] ? item[1] : null;
        teamData.start = item[6] ? myToDate(item[6]) : null;
        teamData.dns = !teamData.start;
        teamData.finish = item[7] ? myToDate(item[7]) : null;
        if (!teamData.dns) teamData.dnf = !teamData.finish;
        teamData.result = dayjs(teamData.finish).diff(dayjs(teamData.start), "minutes");
        teamData.place = teamData.result && teamData.result < KV ? item[0] : null;
        teamData.comm = item[9] ? item[9] : null;
        teamData.members = members;
        teamData.distance = distanceId;

        await postTeam(teamData);


      }

    }

    console.log("...done");
    console.log("");
    console.log("");



  }



}

const fLoadAll = async () => {

  for (let item of dataMap) {
      await fLoadRace(item);
  }

}



fLoadAll();
