import apiClient from './client';

export const fetchChallenges = async () => (await apiClient.get('/challenges')).data;
export const fetchChallengeCatalogue = async () => (await apiClient.get('/challenges/catalogue')).data;
export const joinChallenge = async (payload) => (await apiClient.post('/challenges/join', payload)).data;
export const abandonChallenge = async (id) => (await apiClient.post(`/challenges/${id}/abandon`)).data;
export const removeChallenge = async (id) => (await apiClient.delete(`/challenges/${id}`)).data;
