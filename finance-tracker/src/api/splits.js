import apiClient from './client';

export const fetchGroups = async () => (await apiClient.get('/splits/groups')).data;
export const fetchGroup = async (id) => (await apiClient.get(`/splits/groups/${id}`)).data;
export const createGroup = async (payload) => (await apiClient.post('/splits/groups', payload)).data;
export const joinGroup = async (code) => (await apiClient.post('/splits/groups/join', { code })).data;
export const updateGroup = async ({ id, ...payload }) => (await apiClient.patch(`/splits/groups/${id}`, payload)).data;
export const addMember = async ({ id, ...payload }) => (await apiClient.post(`/splits/groups/${id}/members`, payload)).data;
export const removeMember = async ({ id, memberId }) => (await apiClient.delete(`/splits/groups/${id}/members/${memberId}`)).data;
export const addSplitExpense = async ({ id, ...payload }) => (await apiClient.post(`/splits/groups/${id}/expenses`, payload)).data;
export const deleteSplitExpense = async ({ id, expenseId }) => (await apiClient.delete(`/splits/groups/${id}/expenses/${expenseId}`)).data;
export const settleUp = async ({ id, ...payload }) => (await apiClient.post(`/splits/groups/${id}/settle`, payload)).data;
export const leaveGroup = async (id) => (await apiClient.post(`/splits/groups/${id}/leave`)).data;
