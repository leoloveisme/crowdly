package cloud.crowdly.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex

/**
 * Rows that can be dragged into a new order by the handle each row puts
 * [handle] on (the Noa app's ReorderableListCard). The new order shows at
 * once and [onMove] gets it on drop; TalkBack gets "Move up" / "Move down".
 */
@Composable
fun <T> ReorderableColumn(
    items: List<T>,
    key: (T) -> String,
    enabled: Boolean = true,
    onMove: (List<T>) -> Unit,
    row: @Composable (item: T, handle: Modifier) -> Unit,
) {
    val keys = items.map(key)
    var order by remember(keys) { mutableStateOf(keys) }
    var dragging by remember { mutableStateOf<String?>(null) }
    var offset by remember { mutableFloatStateOf(0f) }
    val heights = remember { mutableStateMapOf<String, Int>() }
    val latestItems by rememberUpdatedState(items)
    val latestMove by rememberUpdatedState(onMove)
    val byKey = { k: String -> latestItems.firstOrNull { key(it) == k } }
    val commit = { next: List<String> ->
        order = next
        if (next != latestItems.map(key)) latestMove(next.mapNotNull(byKey))
    }
    Column {
        order.forEachIndexed { i, k ->
            val item = byKey(k) ?: return@forEachIndexed
            val handle = if (!enabled) Modifier else Modifier.pointerInput(k) {
                detectDragGestures(
                    onDragStart = { dragging = k; offset = 0f },
                    onDrag = { change, amount ->
                        change.consume()
                        offset += amount.y
                        val at = order.indexOf(k)
                        if (offset > 0 && at < order.lastIndex) {
                            val next = heights[order[at + 1]] ?: return@detectDragGestures
                            if (offset > next / 2f) { order = order.toMutableList().apply { add(at + 1, removeAt(at)) }; offset -= next }
                        } else if (offset < 0 && at > 0) {
                            val prev = heights[order[at - 1]] ?: return@detectDragGestures
                            if (-offset > prev / 2f) { order = order.toMutableList().apply { add(at - 1, removeAt(at)) }; offset += prev }
                        }
                    },
                    onDragEnd = { dragging = null; offset = 0f; commit(order) },
                    onDragCancel = { dragging = null; offset = 0f; order = latestItems.map(key) },
                )
            }
            val moved = { by: Int ->
                val at = order.indexOf(k)
                val to = at + by
                if (to in order.indices) commit(order.toMutableList().apply { add(to, removeAt(at)) })
                to in order.indices
            }
            Box(
                Modifier
                    .onSizeChanged { heights[k] = it.height }
                    .zIndex(if (dragging == k) 1f else 0f)
                    .graphicsLayer {
                        translationY = if (dragging == k) offset else 0f
                        shadowElevation = if (dragging == k) 8.dp.toPx() else 0f
                    }
                    .then(if (dragging == k) Modifier.background(MaterialTheme.colorScheme.surfaceContainerHigh) else Modifier)
                    .semantics {
                        if (enabled) customActions = listOfNotNull(
                            CustomAccessibilityAction("Move up") { moved(-1) }.takeIf { i > 0 },
                            CustomAccessibilityAction("Move down") { moved(1) }.takeIf { i < order.lastIndex },
                        )
                    },
            ) { row(item, handle) }
        }
    }
}
