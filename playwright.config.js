import {defineConfig} from '@playwright/test';
import {existsSync} from 'node:fs';
export default defineConfig({testDir:'./e2e',workers:1,timeout:30000,use:{baseURL:'http://localhost:3201',headless:true,launchOptions:{...(existsSync('/usr/bin/chromium')?{executablePath:'/usr/bin/chromium'}:{})}},reporter:'list'});
