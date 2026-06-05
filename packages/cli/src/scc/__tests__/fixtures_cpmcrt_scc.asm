;	Minimal CP/M runtime for SCC translator tests.
	.module	cpmcrt
	.globl	main
	.globl	outstr
	.globl	.gint
	.area	_CODE
START:
	call	main
	ld	c,#0
	call	5
	ret
;
; fetch int from (HL)
.gint:	ld	a,(hl)
	inc	hl
	ld	h,(hl)
	ld	l,a
	ret
;
; print $-terminated string via BDOS function 9
outstr:
	ld	hl,#2
	add	hl,sp
	call	.gint
	ex	de,hl
	ld	c,#9
	call	5
	ret
