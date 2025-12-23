<template>
  <div class="command-list">
    <VList
      v-if="commands.length > 0"
      class="list"
      :data="commands"
    >
      <template #default="{ item: command }">
        <div
          class="command-list-item"
          :class="{ selected: isSelected(command.id) }"
          @click="$emit('toggle', command.id)"
        >
          <div class="checkbox-container">
            <input
              type="checkbox"
              :checked="isSelected(command.id)"
              @click.stop="$emit('toggle', command.id)"
              class="command-checkbox"
            />
          </div>

          <div class="command-details">
            <div class="command-title">{{ command.title }}</div>
            <div v-if="command.description" class="command-description">
              {{ command.description }}
            </div>
            <div class="command-meta">
              <span class="command-language">{{ command.language }}</span>
              <span v-if="parsedTags(command.tags).length > 0" class="command-tags">
                {{ parsedTags(command.tags).join(', ') }}
              </span>
            </div>
          </div>
        </div>
      </template>
    </VList>

    <div v-else class="empty-state">
      {{ emptyMessage }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { VList } from 'virtua/vue'

interface Command {
  id: number
  title: string
  body: string
  description?: string
  tags: string
  language?: string
  created_at: string
  updated_at: string
}

interface Props {
  commands: Command[]
  selectedIds: number[]
  emptyMessage?: string
}

const props = withDefaults(defineProps<Props>(), {
  emptyMessage: 'No commands available'
})

defineEmits<{
  toggle: [id: number]
}>()

const isSelected = (id: number): boolean => {
  return props.selectedIds.includes(id)
}

const parsedTags = (tagsJson: string): string[] => {
  try {
    const tags = JSON.parse(tagsJson)
    return Array.isArray(tags) ? tags : []
  } catch {
    return []
  }
}
</script>

<style scoped>
.command-list {
  background: #2d2d2d;
  border: 1px solid #404040;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.list {
  flex: 1;
  overflow: hidden;
}

.command-list-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 16px;
  cursor: pointer;
  transition: all 0.2s;
  border-bottom: 1px solid #404040;
}

.command-list-item:last-child {
  border-bottom: none;
}

.command-list-item:hover {
  background: #3a3a3a;
}

.command-list-item.selected {
  background: rgba(236, 80, 2, 0.15);
}

.checkbox-container {
  display: flex;
  align-items: center;
  padding-top: 2px;
  flex-shrink: 0;
}

.command-checkbox {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: #ec5002ee;
}

.command-details {
  flex: 1;
  min-width: 0;
}

.command-title {
  font-size: 14px;
  font-weight: 500;
  color: #ffffff;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.command-description {
  font-size: 13px;
  color: #cccccc;
  margin-bottom: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.command-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: #999;
}

.command-language {
  text-transform: capitalize;
}

.command-tags {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-state {
  padding: 40px 20px;
  text-align: center;
  color: #999;
  font-size: 14px;
}
</style>
