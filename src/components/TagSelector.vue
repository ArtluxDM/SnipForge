<template>
  <div class="tag-selector">
    <div class="tag-selector-header">
      <span>{{ title }}</span>
      <button @click="$emit('clear-all')" class="clear-all-btn">Clear All</button>
    </div>

    <VList
      v-if="sortedTags.length > 0"
      class="tag-list"
      :data="sortedTags"
    >
      <template #default="{ item: tag }">
        <div
          class="tag-item"
          :class="{ selected: isSelected(tag) }"
          @click="$emit('toggle', tag)"
        >
          <span class="tag-name">{{ tag }}</span>
          <span v-if="isSelected(tag)" class="checkmark">✓</span>
        </div>
      </template>
    </VList>

    <div v-else class="empty-state">
      No tags available
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { VList } from 'virtua/vue'

interface Props {
  availableTags: string[]
  selectedTags: string[]
  title?: string
}

const props = withDefaults(defineProps<Props>(), {
  title: 'Select Tags'
})

defineEmits<{
  toggle: [tag: string]
  'clear-all': []
}>()

const sortedTags = computed(() => {
  return [...props.availableTags].sort()
})

const isSelected = (tag: string): boolean => {
  return props.selectedTags.includes(tag)
}
</script>

<style scoped>
.tag-selector {
  background: #2d2d2d;
  border: 1px solid #404040;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: 400px;
}

.tag-selector-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #404040;
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
  flex-shrink: 0;
}

.clear-all-btn {
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  background: #404040;
  color: #ffffff;
  transition: all 0.2s;
}

.clear-all-btn:hover {
  background: #505050;
}

.tag-list {
  flex: 1;
  overflow: hidden;
  min-height: 200px;
}

.tag-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 14px;
  color: #e3e3e3;
}

.tag-item:hover {
  background: #3a3a3a;
}

.tag-item.selected {
  background: #ec5002ee;
  color: #ffffff;
}

.tag-name {
  flex: 1;
}

.checkmark {
  color: #ffffff;
  font-weight: bold;
  margin-left: 8px;
}

.empty-state {
  padding: 40px 20px;
  text-align: center;
  color: #999;
  font-size: 14px;
}
</style>
