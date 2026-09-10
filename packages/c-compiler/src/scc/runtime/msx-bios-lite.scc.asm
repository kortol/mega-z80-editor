; MSX BIOS Raw lite runtime: CHGET=$009F, CHPUT=$00A2.
	.module	msx_bios_lite
	.globl	main
	.globl	exit
	.globl	putchar
	.globl	getchar
	.globl	puts
	.globl	.gchar
	.globl	.gint
	.area	_CODE
START:
	call	main
	ld	hl,#0
	call	exit

getchar:
	call	$009f
	ld	l,a
	ld	h,#0
	ret
putchar:
	ld	hl,#2
	add	hl,sp
	call	.gint
	ld	a,l
	call	$00a2
	ld	l,a
	ld	h,#0
	ret
puts:
	ld	hl,#2
	add	hl,sp
	call	.gint
.puts_loop:
	ld	a,(hl)
	or	a
	jr	z,.puts_newline
	push	hl
	call	$00a2
	pop	hl
	inc	hl
	jr	.puts_loop
.puts_newline:
	ld	a,#10
	call	$00a2
	ld	hl,#0
	ret
exit:
{{MSX_EXIT}}
.gchar:
	ld	l,(hl)
	ld	h,#0
	ret
.gint:
	ld	a,(hl)
	inc	hl
	ld	h,(hl)
	ld	l,a
	ret
