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

const postRunner = async (data, members, badge, raceId) => {

  //Исключения в данных
  if ((data.firstName === "Андрюха" && !data.lastName) || (data.lastName === "Андрюха")) {
    data.lastName = "Самойлов";
    data.firstName = "Андрей";
  }

  if (data.lastName === "Ремыга" && data.firstName === "Евгения" ) {
    data.firstName = "Женя";
  }


  if (data.firstName === "Артем") {
    data.firstName = "Артём";
  }

  //Конец исключений в данных

  let filterString = "?";
  filterString += (data.firstName ? "filters[firstName][$eq]=" + data.firstName : "filters[firstName][$null]=true") + "&";
  filterString += (data.lastName ? "filters[lastName][$eq]=" + data.lastName : "filters[lastName][$null]=true") + "&";

  //Попробуем искать без отчества. Будем дописывать отчество, если оно появилось.
  //filterString += (midName ? "filters[midName][$eq]=" + midName : "filters[midName][$null]=true") + "&";

  const resSearch = await instance.get(`/runners${filterString}`);
  let runnerId;
  if (resSearch.data.data.length) {
    const foundRunnerData = resSearch.data.data[0].attributes;
    runnerId = resSearch.data.data[0].id;

    if (foundRunnerData.midName && data.midName && (foundRunnerData.midName !== data.midName)) {
      //исключение "Разные отчества". Если такое есть, остановимся
      console.log("foundRunnerData.midName:", foundRunnerData.midName);
      console.log("data.midName:",data.midName);
      console.log("Загружаем: ");
      console.log(data);
      console.log("raceID:", raceId);
      throw "Разные отчества! Надо разбираться.";
    }

    //Проверяем, не надо ли обновить дату и/или город +отчество
    const yearToUpdate = !foundRunnerData.year && data.year;
    const locationToUpdate = (!foundRunnerData.location || foundRunnerData.location !== data.location) && data.location;
    const midNameToUpdate = (!foundRunnerData.midName) && data.midName;

    const updatesList = {};
    if (yearToUpdate) updatesList.year = yearToUpdate;
    if (locationToUpdate) updatesList.location = locationToUpdate;
    if (midNameToUpdate) updatesList.midName = midNameToUpdate;

    if (Object.keys(updatesList).length) {
      const updateData = { data: { ...updatesList} };
      const resss = await instance.put(`/runners/${runnerId}`, updateData);
    }

  } else {
    const ress = await instance.post(`/runners`, {data});
    runnerId = ress.data.data.id;
  }

  if (badge) {

    const badgeData = {
      data: {
        runner: runnerId,
        race: raceId,
        number: badge,
      }
    }

    const resss = await instance.post(`/badges`, badgeData);
  }


  data.runner = runnerId;
  const memberId = await postMember(data);
  members.push(memberId);


}

const postTeam = async (data) => {

  const ress = await instance.post(`/teams`, {data});

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
         if (item === "dnf") {
           res.dnf = true;
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
          if (item === "dnf") {
            res.dnf = true;
            continue;
          }
          if (item === "adult") {
            res.child = false;
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
  const validRewards = new Set(['1М','2М','3М','1Ж','2Ж','3Ж','1С','2С','3С','1РД','2РД','3РД']);

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

      let currentPlace = 0;

      for (const item of data) {

        let members = [];

        const badges = item[10] ? item[10].split(",") : [];

        let res;
        res = item[2] ? parseRunner(item[2]) : null;
        if (res) await postRunner(res, members, badges[0], raceId);
        res = item[3] ? parseRunner(item[3]) : null;
        if (res) await postRunner(res, members, badges[1], raceId);
        res = item[4] ? parseRunner(item[4]) : null;
        if (res) await postRunner(res, members, badges[2], raceId);
        res = item[5] ? parseKids(item[5]) : [];
        if (res.length) {
          for (const item2 of res) await postRunner(item2, members);
        }

        let teamData = {};

        teamData.name = item[1] ? item[1] : null;
        if (item[6] === "gores") {
          //спецовая загрузка для Лета-2017 и подобных, где нет времени старта
          if (item[8] === "dnf") {
            teamData.dnf = true;
          } else {
            const d1 = myToDate("2025.01.01 00:00:00");
            const d2 = myToDate(`2025.01.01 ${item[8]}`);
            teamData.result = dayjs(d2).diff(dayjs(d1), "minutes");
          }
        } else {
          //обыкновенная загрузка
          teamData.start = item[6] ? myToDate(item[6]) : null;
          teamData.dns = !teamData.start;
          teamData.finish = item[7] ? myToDate(item[7]) : null;
          if (!teamData.dns) teamData.dnf = !teamData.finish;
          teamData.result = dayjs(teamData.finish).diff(dayjs(teamData.start), "minutes");
        }

        if (teamData.result <= KV) {
          teamData.place = +item[0];
        }
        if (teamData.result > KV) {
          teamData.result = null;
          teamData.dnf = true;
        }
        teamData.reward = validRewards.has(item[9]) ? item[9] : null;
        teamData.members = members;
        teamData.distance = distanceId;
        teamData.comm = [!validRewards.has(item[9]) ? item[9] : null, item[11]].filter(item => item).join(" ");

        if (teamData.place && (teamData.place - currentPlace !== 1)) {
          console.log("Ошибка! Неправильное место: ");
          console.log("currentPlace = ", currentPlace);
          console.log("teamData.place = ", teamData.place);
          throw new Error(' == Неправильное место. Выход');
        }
        currentPlace++;

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

  console.log("Заполняем runnersStartedCount");
  const resDistances = await instance.get(`/races?populate=distances.teams.members&sort=id:desc`);
  resDistances.data.data.forEach(itemRace => {
    console.log("");
    console.log(itemRace.attributes.name);
    itemRace.attributes.distances.data.forEach(itemDistance => {
      console.log(`   ` + itemDistance.attributes.name);
      const startedCount = itemDistance.attributes.teams.data.reduce((res, teamsItem) => {
        return res + (!teamsItem.attributes.dns
                      ? teamsItem.attributes.members.data
                           .reduce((res2, membersItem) => res2 + !membersItem.attributes.dns, 0)
                      : 0);
      },0);
      console.log(`   ` + "startedCount= ", startedCount);
      console.log("");
      instance.put(`/distances/${itemDistance.id}`, { data: {runnersStartedCount: startedCount} });
    });
  })
}



fLoadAll();
